import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BuildingAccessService } from '../building-access/building-access.service';
import { ContractConfigsService } from '../contract-configs/contract-configs.service';
import {
  CreateContractPeriodDto,
  ImportContractPeriodsDto,
  UpdateContractPeriodDto,
} from './dto/contract-period.dto';
import {
  contractPeriodInclude,
  toContractPeriodListDto,
} from './contract-period.mapper';
import {
  contractByRoomSelect,
  pickContractFromRoomCandidates,
} from '../common/resolve-contract-by-room';
import { runBatchRemove } from '../common/batch-delete';
import { pushImportIssue, type ImportIssue } from '../common/import-result';

function s(v?: string | null) {
  return (v ?? '').trim();
}

function parseDateOnly(v: string | null | undefined, field: string): Date {
  const raw = s(v);
  if (!raw) throw new BadRequestException(`${field} is required`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`);
  }
  return new Date(`${raw}T00:00:00.000Z`);
}

const PERIOD_UNIT_ALIASES: Record<string, string> = {
  月: '月',
  个月: '月',
  個月: '月',
  month: '月',
  months: '月',
  日: '日',
  天: '日',
  day: '日',
  days: '日',
};

/** 配置标签软匹配：忽略大小写/空白；无命中则保留原文 */
function softMatchDateType(raw: string, labels: string[]): string {
  const needle = raw.replace(/\s+/g, '').toLowerCase();
  if (!needle) return raw;
  for (const label of labels) {
    if (label.replace(/\s+/g, '').toLowerCase() === needle) return label;
  }
  for (const label of labels) {
    const L = label.replace(/\s+/g, '').toLowerCase();
    if (L.includes(needle) || needle.includes(L)) return label;
  }
  return raw;
}

@Injectable()
export class ContractPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractConfigs: ContractConfigsService,
    private readonly access: BuildingAccessService,
  ) {}

  async findAll(params: {
    keyword?: string;
    contractId?: string;
    customerNames?: string[];
    dateTypes?: string[];
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    startDateFrom?: string;
    startDateTo?: string;
    endDateFrom?: string;
    endDateTo?: string;
    createdAtFrom?: string;
    createdAtTo?: string;
    updatedAtFrom?: string;
    updatedAtTo?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Math.floor(Number(params.page) || 1));
    const pageSize = Math.min(500, Math.max(1, Math.floor(Number(params.pageSize) || 20)));
    const where = this.buildListWhere(params);
    await this.access.constrain(where, 'viaContractRoom');

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contractPeriod.count({ where }),
      this.prisma.contractPeriod.findMany({
        where,
        include: contractPeriodInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map(toContractPeriodListDto),
      total,
      page,
      pageSize,
    };
  }

  private buildListWhere(params: {
    keyword?: string;
    contractId?: string;
    customerNames?: string[];
    dateTypes?: string[];
    startDateFrom?: string;
    startDateTo?: string;
    endDateFrom?: string;
    endDateTo?: string;
    createdAtFrom?: string;
    createdAtTo?: string;
    updatedAtFrom?: string;
    updatedAtTo?: string;
  }): Prisma.ContractPeriodWhereInput {
    const where: Prisma.ContractPeriodWhereInput = {};
    if (params.contractId?.trim()) where.contractId = params.contractId.trim();

    const dateTypes = (params.dateTypes || []).map((v) => s(v)).filter(Boolean);
    if (dateTypes.length) where.dateType = { in: dateTypes };

    const customerNames = (params.customerNames || []).map((v) => s(v)).filter(Boolean);
    if (customerNames.length) {
      where.contract = { customer: { name: { in: customerNames } } };
    }

    const keyword = params.keyword?.trim();
    if (keyword) {
      where.OR = [
        { dateType: { contains: keyword, mode: 'insensitive' } },
        { dateUnit: { contains: keyword, mode: 'insensitive' } },
        { contract: { contractCode: { contains: keyword, mode: 'insensitive' } } },
        { contract: { customer: { name: { contains: keyword, mode: 'insensitive' } } } },
        { contract: { room: { roomCode: { contains: keyword, mode: 'insensitive' } } } },
      ];
    }

    const startDate = dateRangeFilter(params.startDateFrom, params.startDateTo);
    if (startDate) where.startDate = startDate;
    const endDate = dateRangeFilter(params.endDateFrom, params.endDateTo);
    if (endDate) where.endDate = endDate;
    const createdAt = dateRangeFilter(params.createdAtFrom, params.createdAtTo, true);
    if (createdAt) where.createdAt = createdAt;
    const updatedAt = dateRangeFilter(params.updatedAtFrom, params.updatedAtTo, true);
    if (updatedAt) where.updatedAt = updatedAt;

    return where;
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.ContractPeriodOrderByWithRelationInput[] {
    const dir: Prisma.SortOrder = sortDir === 'desc' ? 'desc' : 'asc';
    const key = s(sortBy);
    if (!key) return [{ createdAt: 'desc' }, { contract: { contractCode: 'asc' } }, { sortOrder: 'asc' }];
    if (key === 'contractCode') return [{ contract: { contractCode: dir } }, { sortOrder: 'asc' }];
    if (key === 'dateType') return [{ dateType: dir }, { startDate: 'asc' }];
    if (key === 'startDate') return [{ startDate: dir }];
    if (key === 'endDate') return [{ endDate: dir }];
    if (key === 'createdAt') return [{ createdAt: dir }];
    if (key === 'updatedAt') return [{ updatedAt: dir }];
    if (key === 'sortOrder') return [{ sortOrder: dir }, { startDate: 'asc' }];
    if (key === 'dateValue') return [{ dateValue: dir }];
    if (key === 'customerName') {
      return [{ contract: { customer: { name: dir } } }, { startDate: 'asc' }];
    }
    if (key === 'roomCode') {
      return [{ contract: { room: { roomCode: dir } } }, { startDate: 'asc' }];
    }
    return [
      { contract: { contractCode: 'asc' } },
      { sortOrder: 'asc' },
      { startDate: 'asc' },
    ];
  }

  async findOne(id: string) {
    const row = await this.prisma.contractPeriod.findUnique({
      where: { id },
      include: contractPeriodInclude,
    });
    if (!row) throw new NotFoundException(`Contract period ${id} not found`);
    await this.access.assertContractId(row.contractId);
    return toContractPeriodListDto(row);
  }

  /** 合约下若有合约期，则不能全部为免租期（含仅一条免租期） */
  private async assertContractNotOnlyRentFree(
    tx: Prisma.TransactionClient,
    contractId: string,
  ) {
    const rows = await tx.contractPeriod.findMany({
      where: { contractId },
      select: { dateType: true },
    });
    if (!rows.length) return;
    const rentFree = await this.contractConfigs.rentFreePeriodLabels();
    if (rows.every((r) => rentFree.has(r.dateType))) {
      throw new BadRequestException(
        '合約期不能僅有免租期，請至少添加一段使用期或必須使用期',
      );
    }
  }

  async create(dto: CreateContractPeriodDto) {
    const contract = await this.resolveContract(dto.contractId, dto.contractCode);
    const fields = await this.normalizeFields(dto);
    const maxSort = await this.prisma.contractPeriod.aggregate({
      where: { contractId: contract.id },
      _max: { sortOrder: true },
    });
    const sortOrder =
      dto.sortOrder != null
        ? Math.floor(Number(dto.sortOrder))
        : (maxSort._max.sortOrder ?? -1) + 1;

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.contractPeriod.create({
        data: {
          contractId: contract.id,
          dateType: fields.dateType,
          dateUnit: fields.dateUnit,
          dateValue: fields.dateValue,
          startDate: fields.startDate,
          endDate: fields.endDate,
          sortOrder,
        },
        include: contractPeriodInclude,
      });
      await this.assertContractNotOnlyRentFree(tx, contract.id);
      await this.resyncContractDates(tx, contract.id);
      return created;
    });
    return toContractPeriodListDto(row);
  }

  async update(id: string, dto: UpdateContractPeriodDto) {
    const existing = await this.prisma.contractPeriod.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Contract period ${id} not found`);

    let contractId = existing.contractId;
    if (dto.contractId !== undefined || dto.contractCode !== undefined) {
      const contract = await this.resolveContract(dto.contractId, dto.contractCode);
      contractId = contract.id;
    }

    const merged = {
      dateType: dto.dateType !== undefined ? dto.dateType : existing.dateType,
      dateUnit: dto.dateUnit !== undefined ? dto.dateUnit : existing.dateUnit,
      dateValue: dto.dateValue !== undefined ? dto.dateValue : existing.dateValue,
      startDate:
        dto.startDate !== undefined ? dto.startDate : dateOnlyStr(existing.startDate),
      endDate: dto.endDate !== undefined ? dto.endDate : dateOnlyStr(existing.endDate),
    };
    const fields = await this.normalizeFields(merged);

    const oldContractId = existing.contractId;
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.contractPeriod.update({
        where: { id },
        data: {
          contractId,
          dateType: fields.dateType,
          dateUnit: fields.dateUnit,
          dateValue: fields.dateValue,
          startDate: fields.startDate,
          endDate: fields.endDate,
          sortOrder:
            dto.sortOrder !== undefined ? Math.floor(Number(dto.sortOrder)) : undefined,
        },
        include: contractPeriodInclude,
      });
      await this.assertContractNotOnlyRentFree(tx, contractId);
      if (oldContractId !== contractId) {
        await this.assertContractNotOnlyRentFree(tx, oldContractId);
      }
      await this.resyncContractDates(tx, contractId);
      if (oldContractId !== contractId) {
        await this.resyncContractDates(tx, oldContractId);
      }
      return updated;
    });
    return toContractPeriodListDto(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.contractPeriod.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Contract period ${id} not found`);
    await this.prisma.$transaction(async (tx) => {
      await tx.contractPeriod.delete({ where: { id } });
      await this.assertContractNotOnlyRentFree(tx, existing.contractId);
      await this.resyncContractDates(tx, existing.contractId);
    });
    return { success: true };
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }

  async importBatch(dto: ImportContractPeriodsDto) {
    const items = dto.items || [];
    let created = 0;
    let skipped = 0;
    let failed = 0;
    let unlinked = 0;
    const issues: ImportIssue[] = [];

    const codes = [
      ...new Set(items.map((it) => s(it.contractCode) || '').filter(Boolean)),
    ];
    const idHints = [
      ...new Set(items.map((it) => s(it.contractId) || '').filter(Boolean)),
    ];
    const roomCodes = [
      ...new Set(items.map((it) => s(it.roomCode) || '').filter(Boolean)),
    ];

    const contracts =
      codes.length || idHints.length
        ? await this.prisma.contract.findMany({
            where: {
              OR: [
                ...(codes.length ? [{ contractCode: { in: codes } }] : []),
                ...(idHints.length ? [{ id: { in: idHints } }] : []),
              ],
            },
            select: { id: true, contractCode: true },
          })
        : [];
    const byCode = new Map(contracts.map((c) => [c.contractCode.toLowerCase(), c]));
    const byId = new Map(contracts.map((c) => [c.id, c]));

    const rooms = roomCodes.length
      ? await this.prisma.room.findMany({
          where: { roomCode: { in: roomCodes } },
          select: { id: true, roomCode: true },
        })
      : [];
    const roomByCode = new Map(rooms.map((r) => [r.roomCode.toLowerCase(), r]));
    const roomIds = rooms.map((r) => r.id);

    const contractsByRoom =
      roomIds.length
        ? await this.prisma.contract.findMany({
            where: { roomId: { in: roomIds } },
            select: contractByRoomSelect,
          })
        : [];
    const contractsForRoom = new Map<string, typeof contractsByRoom>();
    for (const c of contractsByRoom) {
      const list = contractsForRoom.get(c.roomId) || [];
      list.push(c);
      contractsForRoom.set(c.roomId, list);
    }

    const contractIds = [
      ...new Set([
        ...contracts.map((c) => c.id),
        ...contractsByRoom.map((c) => c.id),
      ]),
    ];

    const existing = contractIds.length
      ? await this.prisma.contractPeriod.findMany({
          where: { contractId: { in: contractIds } },
          select: {
            contractId: true,
            dateType: true,
            startDate: true,
            endDate: true,
            contract: { select: { contractCode: true } },
          },
        })
      : [];
    const seen = new Set(
      existing.map(
        (r) =>
          `${(r.contract?.contractCode || r.contractId).toLowerCase()}|${r.dateType}|${dateOnlyStr(r.startDate)}|${dateOnlyStr(r.endDate)}`,
      ),
    );

    const touched = new Set<string>();
    const periodLabels = await this.contractConfigs.activePeriodTypeLabels();
    const labelSet = new Set(periodLabels);

    for (const item of items) {
      const contractCode = s(item.contractCode);
      const contractId = s(item.contractId);
      const roomCode = s(item.roomCode);
      const customerName = s(item.customerName);
      const keys = {
        合約編號: contractCode,
        房間編號: roomCode,
        客戶名稱: customerName,
      };

      if (!contractCode && !contractId && !roomCode) {
        skipped += 1;
        pushImportIssue(issues, 'skipped', '缺少合約編號、合約 ID 或房間編號', keys);
        continue;
      }

      let contract: { id: string; contractCode: string } | null = contractId
        ? byId.get(contractId) || null
        : contractCode
          ? byCode.get(contractCode.toLowerCase()) || null
          : null;

      if (!contract && roomCode) {
        const room = roomByCode.get(roomCode.toLowerCase());
        if (!room) {
          unlinked += 1;
          pushImportIssue(issues, 'unlinked', `房間「${roomCode}」未找到`, keys);
          continue;
        }
        const picked = pickContractFromRoomCandidates(
          contractsForRoom.get(room.id) || [],
          customerName || undefined,
        );
        if (!picked) {
          unlinked += 1;
          pushImportIssue(
            issues,
            'unlinked',
            customerName
              ? `房間「${roomCode}」下無法唯一匹配客戶「${customerName}」的合約`
              : `房間「${roomCode}」下無有效合約或合約不唯一`,
            keys,
          );
          continue;
        }
        contract = { id: picked.id, contractCode: picked.contractCode };
      }

      if (!contract) {
        unlinked += 1;
        pushImportIssue(
          issues,
          'unlinked',
          contractCode
            ? `合約編號「${contractCode}」未找到`
            : contractId
              ? `合約 ID「${contractId}」未找到`
              : '無法解析關聯合約',
          keys,
        );
        continue;
      }

      let fields;
      try {
        fields = await this.normalizeFields(item, labelSet, true);
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : '期間字段驗證失敗';
        pushImportIssue(issues, 'failed', msg, { ...keys, 合約編號: contract.contractCode });
        continue;
      }

      const dupKey = `${contract.contractCode.toLowerCase()}|${fields.dateType}|${dateOnlyStr(fields.startDate)}|${dateOnlyStr(fields.endDate)}`;
      if (seen.has(dupKey)) {
        skipped += 1;
        pushImportIssue(
          issues,
          'skipped',
          `合約「${contract.contractCode}」已存在相同期間記錄`,
          {
            ...keys,
            合約編號: contract.contractCode,
            日期類型: fields.dateType,
            開始日期: dateOnlyStr(fields.startDate),
            結束日期: dateOnlyStr(fields.endDate),
          },
        );
        continue;
      }

      try {
        const maxSort = await this.prisma.contractPeriod.aggregate({
          where: { contractId: contract.id },
          _max: { sortOrder: true },
        });
        const sortOrder =
          item.sortOrder != null
            ? Math.floor(Number(item.sortOrder))
            : (maxSort._max.sortOrder ?? -1) + 1;
        await this.prisma.contractPeriod.create({
          data: {
            contractId: contract.id,
            dateType: fields.dateType,
            dateUnit: fields.dateUnit,
            dateValue: fields.dateValue,
            startDate: fields.startDate,
            endDate: fields.endDate,
            sortOrder,
          },
        });
        seen.add(dupKey);
        touched.add(contract.id);
        created += 1;
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : '建立合約期間失敗';
        pushImportIssue(issues, 'failed', msg, { ...keys, 合約編號: contract.contractCode });
      }
    }

    for (const cid of touched) {
      await this.resyncContractDates(this.prisma, cid);
    }

    return { created, skipped, failed, unlinked, issues };
  }

  private async resolveContract(contractId?: string | null, contractCode?: string | null) {
    const id = s(contractId || undefined);
    const code = s(contractCode);
    if (id) {
      const row = await this.prisma.contract.findUnique({ where: { id } });
      if (!row) throw new BadRequestException('Invalid contractId');
      return row;
    }
    if (code) {
      const row = await this.prisma.contract.findUnique({ where: { contractCode: code } });
      if (!row) throw new BadRequestException(`Contract「${code}」not found`);
      return row;
    }
    throw new BadRequestException('contractId or contractCode is required');
  }

  private async normalizeFields(
    dto: {
      dateType?: string;
      dateUnit?: string;
      dateValue?: number;
      startDate?: string;
      endDate?: string;
    },
    labelSet?: Set<string>,
    softDateType = false,
  ) {
    const rawType = s(dto.dateType);
    if (!rawType) throw new BadRequestException('dateType is required');
    const labels = labelSet
      ? [...labelSet]
      : await this.contractConfigs.activePeriodTypeLabels();
    const dateType = softDateType ? softMatchDateType(rawType, labels) : rawType;
    if (!softDateType && labels.length && !labels.includes(dateType)) {
      throw new BadRequestException(`dateType must be one of: ${labels.join(' / ')}`);
    }

    const unitRaw = s(dto.dateUnit) || '月';
    const dateUnit =
      PERIOD_UNIT_ALIASES[unitRaw] || PERIOD_UNIT_ALIASES[unitRaw.toLowerCase()] || unitRaw;
    if (dateUnit !== '月' && dateUnit !== '日') {
      throw new BadRequestException('dateUnit must be 月 or 日');
    }

    const startDate = parseDateOnly(dto.startDate, 'startDate');
    const endDate = parseDateOnly(dto.endDate, 'endDate');
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate must be >= startDate');
    }

    return {
      dateType,
      dateUnit,
      dateValue: Math.max(0, Math.floor(Number(dto.dateValue ?? 0) || 0)),
      startDate,
      endDate,
    };
  }

  private async resyncContractDates(
    db: Prisma.TransactionClient | PrismaService,
    contractId: string,
  ) {
    const periods = await db.contractPeriod.findMany({
      where: { contractId },
      select: { dateType: true, startDate: true, endDate: true },
    });
    if (!periods.length) {
      await db.contract.update({
        where: { id: contractId },
        data: { startDate: null, endDate: null },
      });
      return;
    }
    const usageLabels = await this.contractConfigs.usagePeriodLabels();
    const usage = periods.filter((p) => usageLabels.has(p.dateType));
    const src = usage.length ? usage : periods;
    let min = src[0].startDate.getTime();
    let max = src[0].endDate.getTime();
    for (const p of src) {
      min = Math.min(min, p.startDate.getTime());
      max = Math.max(max, p.endDate.getTime());
    }
    await db.contract.update({
      where: { id: contractId },
      data: { startDate: new Date(min), endDate: new Date(max) },
    });
  }
}

function dateOnlyStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 日期范围 → Prisma DateTimeFilter；dateOnly=false 时对结束日包含整天 */
function dateRangeFilter(
  from?: string,
  to?: string,
  endInclusiveDay = false,
): Prisma.DateTimeFilter | undefined {
  const fromRaw = s(from);
  const toRaw = s(to);
  if (!fromRaw && !toRaw) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (fromRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw)) return undefined;
    filter.gte = new Date(`${fromRaw}T00:00:00.000Z`);
  }
  if (toRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) return undefined;
    if (endInclusiveDay) {
      filter.lte = new Date(`${toRaw}T23:59:59.999Z`);
    } else {
      filter.lte = new Date(`${toRaw}T00:00:00.000Z`);
    }
  }
  return filter;
}
