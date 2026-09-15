import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto, ContractPeriodInputDto, UpdateContractDto, ImportContractsDto } from './dto/contract.dto';
import { contractInclude, toContractDto } from './contract.mapper';
import { ContractConfigsService } from '../contract-configs/contract-configs.service';
import { userWhereActorLabels } from '../common/audit';
import {
  dateRangeFilter,
  paginateArgs,
  parsePage,
  parsePageSize,
  parseSortDir,
  type PaginatedResult,
} from '../common/pagination';
import { runBatchRemove } from '../common/batch-delete';
import { pushImportIssue, type ImportIssue } from '../common/import-result';

const ALLOWED_STATUSES = new Set([
  '草稿',
  '簽約中',
  '已簽約',
  '交吉中',
  '租賃中',
  '已完成',
  '退租中',
  '已退租',
  '已取消',
  '已續約',
]);

const STATUS_ALIASES: Record<string, string> = {
  草稿: '草稿',
  draft: '草稿',
  簽約中: '簽約中',
  签约中: '簽約中',
  signing: '簽約中',
  已簽約: '已簽約',
  已签约: '已簽約',
  signed: '已簽約',
  交吉中: '交吉中',
  租賃中: '租賃中',
  租赁中: '租賃中',
  leased: '租賃中',
  已完成: '已完成',
  completed: '已完成',
  退租中: '退租中',
  terminating: '退租中',
  已退租: '已退租',
  terminated: '已退租',
  已取消: '已取消',
  cancelled: '已取消',
  canceled: '已取消',
  已續約: '已續約',
  已续约: '已續約',
  renewed: '已續約',
};

const ALLOWED_PERIOD_UNITS = new Set(['月', '日']);
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

/** 合约状态 → 房间状态（保存时同步） */
const ROOM_STATUS_BY_CONTRACT: Record<string, RoomStatus> = {
  草稿: RoomStatus.idle,
  簽約中: RoomStatus.signing,
  已簽約: RoomStatus.signing,
  交吉中: RoomStatus.signing,
  租賃中: RoomStatus.leased,
  已續約: RoomStatus.leased,
  退租中: RoomStatus.terminating,
  已退租: RoomStatus.idle,
  已完成: RoomStatus.idle,
  已取消: RoomStatus.idle,
};

function s(v: string | null | undefined) {
  return (v ?? '').trim();
}

function parseDateOnly(v: string | null | undefined, field: string): Date | null {
  const raw = s(v);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`);
  }
  return new Date(`${raw}T00:00:00.000Z`);
}

function nullId(v: string | null | undefined): string | null {
  const t = s(v);
  return t || null;
}

function numOrNull(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Number(v);
}

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractConfigs: ContractConfigsService,
  ) {}

  async findAll(params: {
    keyword?: string;
    status?: string;
    statuses?: string[];
    customerId?: string;
    roomId?: string;
    roomCodes?: string[];
    customerNames?: string[];
    salesManagers?: string[];
    leaseTypes?: string[];
    paymentCycles?: string[];
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    startDateFrom?: string;
    startDateTo?: string;
    endDateFrom?: string;
    endDateTo?: string;
    createdAtFrom?: string;
    createdAtTo?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<ReturnType<typeof toContractDto>>> {
    const page = parsePage(params.page);
    const pageSize = parsePageSize(params.pageSize);
    const where = this.buildListWhere(params);
    const { skip, take } = paginateArgs(page, pageSize);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contract.count({ where }),
      this.prisma.contract.findMany({
        where,
        include: contractInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...(skip != null ? { skip, take } : {}),
      }),
    ]);

    return {
      items: rows.map(toContractDto),
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    };
  }

  private buildListWhere(params: {
    keyword?: string;
    status?: string;
    statuses?: string[];
    customerId?: string;
    roomId?: string;
    roomCodes?: string[];
    customerNames?: string[];
    salesManagers?: string[];
    leaseTypes?: string[];
    paymentCycles?: string[];
    startDateFrom?: string;
    startDateTo?: string;
    endDateFrom?: string;
    endDateTo?: string;
    createdAtFrom?: string;
    createdAtTo?: string;
  }): Prisma.ContractWhereInput {
    const where: Prisma.ContractWhereInput = {};
    const and: Prisma.ContractWhereInput[] = [];

    if (params.customerId?.trim()) where.customerId = params.customerId.trim();
    if (params.roomId?.trim()) where.roomId = params.roomId.trim();

    const statuses = [
      ...new Set(
        [...(params.statuses || []), params.status?.trim() || '']
          .map((v) => s(v))
          .filter(Boolean),
      ),
    ];
    if (statuses.length === 1) where.status = statuses[0];
    else if (statuses.length > 1) where.status = { in: statuses };

    const roomCodes = (params.roomCodes || []).map((v) => s(v)).filter(Boolean);
    if (roomCodes.length) {
      and.push({ room: { roomCode: { in: roomCodes } } });
    }

    const customerNames = (params.customerNames || []).map((v) => s(v)).filter(Boolean);
    if (customerNames.length) {
      and.push({ customer: { name: { in: customerNames } } });
    }

    const salesManagers = (params.salesManagers || []).map((v) => s(v)).filter(Boolean);
    if (salesManagers.length) {
      and.push({ salesManagerUser: userWhereActorLabels(salesManagers) });
    }

    const leaseTypes = (params.leaseTypes || []).map((v) => s(v)).filter(Boolean);
    if (leaseTypes.length === 1) where.leaseType = leaseTypes[0];
    else if (leaseTypes.length > 1) where.leaseType = { in: leaseTypes };

    const paymentCycles = (params.paymentCycles || []).map((v) => s(v)).filter(Boolean);
    if (paymentCycles.length === 1) where.paymentCycle = paymentCycles[0];
    else if (paymentCycles.length > 1) where.paymentCycle = { in: paymentCycles };

    const keyword = s(params.keyword);
    if (keyword) {
      and.push({
        OR: [
          { contractCode: { contains: keyword, mode: 'insensitive' } },
          { leaseType: { contains: keyword, mode: 'insensitive' } },
          { paymentCycle: { contains: keyword, mode: 'insensitive' } },
          { roomNameText: { contains: keyword, mode: 'insensitive' } },
          { remark: { contains: keyword, mode: 'insensitive' } },
          { subleaseMark: { contains: keyword, mode: 'insensitive' } },
          { customer: { name: { contains: keyword, mode: 'insensitive' } } },
          { customer: { customerCode: { contains: keyword, mode: 'insensitive' } } },
          { room: { roomCode: { contains: keyword, mode: 'insensitive' } } },
          { room: { name: { contains: keyword, mode: 'insensitive' } } },
          { salesManagerUser: { account: { contains: keyword, mode: 'insensitive' } } },
          { salesManagerUser: { displayName: { contains: keyword, mode: 'insensitive' } } },
        ],
      });
    }

    const startDate = dateRangeFilter(params.startDateFrom, params.startDateTo);
    if (startDate) where.startDate = startDate;
    const endDate = dateRangeFilter(params.endDateFrom, params.endDateTo);
    if (endDate) where.endDate = endDate;
    const createdAt = dateRangeFilter(params.createdAtFrom, params.createdAtTo, true);
    if (createdAt) where.createdAt = createdAt;

    if (and.length) where.AND = and;
    return where;
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.ContractOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'desc';
    const key = s(sortBy);
    if (key === 'contractCode') return [{ contractCode: dir }];
    if (key === 'roomCode') return [{ room: { roomCode: dir } }];
    if (key === 'customerName') return [{ customer: { name: dir } }];
    if (key === 'salesManager') {
      return [
        { salesManagerUser: { displayName: dir } },
        { salesManagerUser: { account: dir } },
      ];
    }
    if (key === 'startDate') return [{ startDate: dir }, { createdAt: 'desc' }];
    if (key === 'endDate') return [{ endDate: dir }, { createdAt: 'desc' }];
    if (key === 'status') return [{ status: dir }, { startDate: 'desc' }];
    if (key === 'leaseType') return [{ leaseType: dir }];
    if (key === 'monthlyRent') return [{ monthlyRent: dir }];
    if (key === 'paymentCycle') return [{ paymentCycle: dir }];
    if (key === 'createdAt') return [{ createdAt: dir }];
    return [{ startDate: 'desc' }, { createdAt: 'desc' }];
  }

  async findOne(id: string) {
    const row = await this.prisma.contract.findUnique({
      where: { id },
      include: contractInclude,
    });
    if (!row) throw new NotFoundException(`Contract ${id} not found`);
    return toContractDto(row);
  }

  private async nextContractCode() {
    const now = new Date();
    const y = String(now.getFullYear()).slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const prefix = `CTR${y}${m}${d}`;
    const latest = await this.prisma.contract.findFirst({
      where: { contractCode: { startsWith: prefix } },
      orderBy: { contractCode: 'desc' },
      select: { contractCode: true },
    });
    let seq = 1;
    if (latest) {
      const n = Number(latest.contractCode.slice(prefix.length));
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async assertRoom(roomId: string) {
    const r = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, name: true, roomCode: true, monthlyRent: true, subleaseMark: true },
    });
    if (!r) throw new BadRequestException('Invalid roomId');
    return r;
  }

  private async assertCustomer(customerId: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!c) throw new BadRequestException('Invalid customerId');
  }

  private async assertUser(userId: string | null) {
    if (!userId) return;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new BadRequestException('Invalid salesManagerId');
  }

  private async assertRequirement(requirementId: string | null, customerId?: string) {
    if (!requirementId) return;
    const row = await this.prisma.customerRequirement.findUnique({
      where: { id: requirementId },
      select: { id: true, customerId: true },
    });
    if (!row) throw new BadRequestException('Invalid requirementId');
    if (customerId && row.customerId !== customerId) {
      throw new BadRequestException('requirementId 不属于所选客户');
    }
  }

  private normalizeStatus(status?: string) {
    const raw = s(status) || '草稿';
    const v = STATUS_ALIASES[raw] || STATUS_ALIASES[raw.toLowerCase()] || raw;
    if (!ALLOWED_STATUSES.has(v)) {
      throw new BadRequestException(`status must be one of: ${[...ALLOWED_STATUSES].join(' / ')}`);
    }
    return v;
  }

  private async normalizePeriodType(v?: string) {
    const raw = s(v);
    if (!raw) throw new BadRequestException('periods.dateType is required');
    const labels = await this.contractConfigs.activePeriodTypeLabels();
    if (!labels.includes(raw)) {
      throw new BadRequestException(
        labels.length
          ? `periods.dateType must be one of: ${labels.join(' / ')}`
          : 'No active period types configured',
      );
    }
    return raw;
  }

  private normalizePeriodUnit(v?: string) {
    const raw = s(v) || '月';
    const mapped = PERIOD_UNIT_ALIASES[raw] || PERIOD_UNIT_ALIASES[raw.toLowerCase()] || raw;
    if (!ALLOWED_PERIOD_UNITS.has(mapped)) {
      throw new BadRequestException(`periods.dateUnit must be one of: 月 / 日`);
    }
    return mapped;
  }

  private async parsePeriods(items?: ContractPeriodInputDto[]) {
    if (!items?.length) return [];
    const out = [];
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const startDate = parseDateOnly(item.startDate, `periods[${idx}].startDate`);
      const endDate = parseDateOnly(item.endDate, `periods[${idx}].endDate`);
      if (!startDate || !endDate) {
        throw new BadRequestException(`periods[${idx}] startDate/endDate are required`);
      }
      if (endDate.getTime() < startDate.getTime()) {
        throw new BadRequestException(`periods[${idx}] endDate must be >= startDate`);
      }
      out.push({
        dateType: await this.normalizePeriodType(item.dateType),
        dateUnit: this.normalizePeriodUnit(item.dateUnit),
        dateValue: Math.max(0, Math.floor(Number(item.dateValue ?? 0) || 0)),
        startDate,
        endDate,
        sortOrder: item.sortOrder != null ? Math.floor(Number(item.sortOrder)) : idx,
      });
    }
    return out;
  }

  /** 用「使用期」汇总合约起止；无使用期则用全部合约期 */
  private async summarizeDatesFromPeriods(
    periods: { dateType: string; startDate: Date; endDate: Date }[],
  ): Promise<{ startDate: Date | null; endDate: Date | null }> {
    if (!periods.length) return { startDate: null, endDate: null };
    const usageLabels = await this.contractConfigs.usagePeriodLabels();
    const usage = periods.filter((p) => usageLabels.has(p.dateType));
    const src = usage.length ? usage : periods;
    let min = src[0].startDate.getTime();
    let max = src[0].endDate.getTime();
    for (const p of src) {
      min = Math.min(min, p.startDate.getTime());
      max = Math.max(max, p.endDate.getTime());
    }
    return { startDate: new Date(min), endDate: new Date(max) };
  }

  private async replacePeriods(
    tx: Prisma.TransactionClient,
    contractId: string,
    periods: {
      dateType: string;
      dateUnit: string;
      dateValue: number;
      startDate: Date;
      endDate: Date;
      sortOrder: number;
    }[],
  ) {
    await tx.contractPeriod.deleteMany({ where: { contractId } });
    if (!periods.length) return;
    await tx.contractPeriod.createMany({
      data: periods.map((p) => ({
        contractId,
        dateType: p.dateType,
        dateUnit: p.dateUnit,
        dateValue: p.dateValue,
        startDate: p.startDate,
        endDate: p.endDate,
        sortOrder: p.sortOrder,
      })),
    });
  }

  /** 同步房间最新合约标识与状态 */
  private async syncRoomFromContract(
    tx: Prisma.TransactionClient,
    roomId: string,
    contractCode: string,
    status: string,
    actorId: string | null,
  ) {
    const roomStatus = ROOM_STATUS_BY_CONTRACT[status];
    await tx.room.update({
      where: { id: roomId },
      data: {
        latestContract: contractCode,
        ...(roomStatus ? { status: roomStatus } : {}),
        ...(actorId ? { updatedById: actorId } : {}),
      },
    });
  }

  async create(dto: CreateContractDto, actor = '') {
    const roomId = s(dto.roomId);
    const customerId = s(dto.customerId);
    if (!roomId) throw new BadRequestException('roomId is required');
    if (!customerId) throw new BadRequestException('customerId is required');

    const room = await this.assertRoom(roomId);
    await this.assertCustomer(customerId);

    const salesManagerId = nullId(dto.salesManagerId);
    await this.assertUser(salesManagerId);

    const requirementId = nullId(dto.requirementId);
    await this.assertRequirement(requirementId, customerId);

    const contractCode = s(dto.contractCode) || (await this.nextContractCode());
    const status = this.normalizeStatus(dto.status);
    const actorId = actor || null;
    const roomNameText = s(dto.roomNameText) || room.name;
    const subleaseMark = s(dto.subleaseMark) || s(room.subleaseMark);
    const monthlyRent =
      dto.monthlyRent !== undefined ? numOrNull(dto.monthlyRent) : Number(room.monthlyRent);
    const periods = await this.parsePeriods(dto.periods);
    const summarized = await this.summarizeDatesFromPeriods(periods);
    const startDate =
      dto.startDate !== undefined
        ? parseDateOnly(dto.startDate, 'startDate')
        : summarized.startDate;
    const endDate =
      dto.endDate !== undefined ? parseDateOnly(dto.endDate, 'endDate') : summarized.endDate;
    const keyDeposits = await this.contractConfigs.calcKeyDeposits(
      dto.doorKeyQty,
      dto.mailboxKeyQty,
    );

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.contract.create({
          data: {
            contractCode,
            roomId,
            customerId,
            salesManagerId,
            requirementId,
            startDate,
            endDate,
            actualEndDate: parseDateOnly(dto.actualEndDate, 'actualEndDate'),
            leaseType: s(dto.leaseType),
            status,
            roomDeposit: numOrNull(dto.roomDeposit),
            monthlyRent,
            bookingDeposit: numOrNull(dto.bookingDeposit),
            paymentCycle: s(dto.paymentCycle),
            electricityRate: numOrNull(dto.electricityRate),
            miscDeposit: numOrNull(dto.miscDeposit),
            doorKeyQty: keyDeposits.doorKeyQty,
            mailboxKeyQty: keyDeposits.mailboxKeyQty,
            doorKeyDeposit: keyDeposits.doorKeyDeposit,
            mailboxKeyDeposit: keyDeposits.mailboxKeyDeposit,
            roomNameText,
            subleaseMark,
            attachment: s(dto.attachment),
            remark: s(dto.remark),
            createdById: actorId,
            updatedById: actorId,
          },
        });
        await this.replacePeriods(tx, created.id, periods);
        await this.syncRoomFromContract(tx, roomId, contractCode, status, actorId);
        return tx.contract.findUniqueOrThrow({
          where: { id: created.id },
          include: contractInclude,
        });
      });
      return toContractDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Contract code「${contractCode}」already exists`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateContractDto, actor = '') {
    const existing = await this.prisma.contract.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Contract ${id} not found`);

    let roomId = existing.roomId;
    if (dto.roomId !== undefined) {
      roomId = s(dto.roomId);
      if (!roomId) throw new BadRequestException('roomId is required');
      await this.assertRoom(roomId);
    }

    let customerId = existing.customerId;
    if (dto.customerId !== undefined) {
      customerId = s(dto.customerId);
      if (!customerId) throw new BadRequestException('customerId is required');
      await this.assertCustomer(customerId);
    }

    const salesManagerId =
      dto.salesManagerId !== undefined ? nullId(dto.salesManagerId) : undefined;
    if (salesManagerId !== undefined) await this.assertUser(salesManagerId);

    const requirementId =
      dto.requirementId !== undefined ? nullId(dto.requirementId) : undefined;
    if (requirementId !== undefined) {
      await this.assertRequirement(requirementId, customerId);
    }

    const status = dto.status !== undefined ? this.normalizeStatus(dto.status) : existing.status;
    const contractCode =
      dto.contractCode !== undefined ? s(dto.contractCode) : existing.contractCode;
    const actorId = actor || null;
    const replacePeriods = dto.periods !== undefined;
    const periods = replacePeriods ? await this.parsePeriods(dto.periods) : null;
    const summarized = periods ? await this.summarizeDatesFromPeriods(periods) : null;
    const recalcKeys =
      dto.doorKeyQty !== undefined || dto.mailboxKeyQty !== undefined
        ? await this.contractConfigs.calcKeyDeposits(
            dto.doorKeyQty !== undefined ? dto.doorKeyQty : existing.doorKeyQty,
            dto.mailboxKeyQty !== undefined ? dto.mailboxKeyQty : existing.mailboxKeyQty,
          )
        : null;

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.contract.update({
          where: { id },
          data: {
            contractCode: dto.contractCode !== undefined ? contractCode : undefined,
            roomId: dto.roomId !== undefined ? roomId : undefined,
            customerId: dto.customerId !== undefined ? customerId : undefined,
            salesManagerId,
            requirementId,
            startDate:
              dto.startDate !== undefined
                ? parseDateOnly(dto.startDate, 'startDate')
                : summarized
                  ? summarized.startDate
                  : undefined,
            endDate:
              dto.endDate !== undefined
                ? parseDateOnly(dto.endDate, 'endDate')
                : summarized
                  ? summarized.endDate
                  : undefined,
            actualEndDate:
              dto.actualEndDate !== undefined
                ? parseDateOnly(dto.actualEndDate, 'actualEndDate')
                : undefined,
            leaseType: dto.leaseType !== undefined ? s(dto.leaseType) : undefined,
            status: dto.status !== undefined ? status : undefined,
            roomDeposit:
              dto.roomDeposit !== undefined ? numOrNull(dto.roomDeposit) : undefined,
            monthlyRent:
              dto.monthlyRent !== undefined ? numOrNull(dto.monthlyRent) : undefined,
            bookingDeposit:
              dto.bookingDeposit !== undefined ? numOrNull(dto.bookingDeposit) : undefined,
            paymentCycle: dto.paymentCycle !== undefined ? s(dto.paymentCycle) : undefined,
            electricityRate:
              dto.electricityRate !== undefined ? numOrNull(dto.electricityRate) : undefined,
            miscDeposit:
              dto.miscDeposit !== undefined ? numOrNull(dto.miscDeposit) : undefined,
            ...(recalcKeys
              ? {
                  doorKeyQty: recalcKeys.doorKeyQty,
                  mailboxKeyQty: recalcKeys.mailboxKeyQty,
                  doorKeyDeposit: recalcKeys.doorKeyDeposit,
                  mailboxKeyDeposit: recalcKeys.mailboxKeyDeposit,
                }
              : {}),
            roomNameText: dto.roomNameText !== undefined ? s(dto.roomNameText) : undefined,
            subleaseMark: dto.subleaseMark !== undefined ? s(dto.subleaseMark) : undefined,
            attachment: dto.attachment !== undefined ? s(dto.attachment) : undefined,
            remark: dto.remark !== undefined ? s(dto.remark) : undefined,
            ...(actorId ? { updatedById: actorId } : {}),
          },
        });
        if (periods) await this.replacePeriods(tx, id, periods);
        await this.syncRoomFromContract(tx, roomId, contractCode, status, actorId);
        return tx.contract.findUniqueOrThrow({
          where: { id },
          include: contractInclude,
        });
      });
      return toContractDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Contract code「${contractCode}」already exists`);
      }
      throw e;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.contract.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Contract ${id} not found`);
    await this.prisma.contract.delete({ where: { id } });
    return { success: true };
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }

  /** 批量导入：按房间编号 + 客户编号（或客户名称）关联；合约编号重复则跳过 */
  async importBatch(dto: ImportContractsDto, actor = '') {
    const items = dto.items || [];
    let created = 0;
    let skipped = 0;
    let unlinked = 0;
    let failed = 0;
    const issues: ImportIssue[] = [];

    const roomCodes = [...new Set(items.map((it) => s(it.roomCode)).filter(Boolean))];
    const customerCodes = [...new Set(items.map((it) => s(it.customerCode)).filter(Boolean))];
    const customerNames = [
      ...new Set(
        items
          .filter((it) => !s(it.customerCode) && s(it.customerName))
          .map((it) => s(it.customerName)),
      ),
    ];
    const reqCodes = [...new Set(items.map((it) => s(it.requirementCode)).filter(Boolean))];
    const contractCodes = [...new Set(items.map((it) => s(it.contractCode)).filter(Boolean))];

    const [rooms, customersByCode, customersByName, users, requirements, existingContracts] =
      await Promise.all([
        roomCodes.length
          ? this.prisma.room.findMany({
              where: { roomCode: { in: roomCodes } },
              select: {
                id: true,
                roomCode: true,
                name: true,
                subleaseMark: true,
                monthlyRent: true,
              },
            })
          : Promise.resolve([]),
        customerCodes.length
          ? this.prisma.customer.findMany({
              where: { customerCode: { in: customerCodes } },
              select: { id: true, customerCode: true, name: true },
            })
          : Promise.resolve([]),
        customerNames.length
          ? this.prisma.customer.findMany({
              where: {
                OR: customerNames.map((name) => ({
                  name: { equals: name, mode: 'insensitive' as const },
                })),
              },
              select: { id: true, customerCode: true, name: true },
            })
          : Promise.resolve([]),
        this.prisma.user.findMany({
          select: { id: true, account: true, displayName: true },
        }),
        reqCodes.length
          ? this.prisma.customerRequirement.findMany({
              where: { requirementCode: { in: reqCodes } },
              select: { id: true, requirementCode: true, customerId: true },
            })
          : Promise.resolve([]),
        contractCodes.length
          ? this.prisma.contract.findMany({
              where: { contractCode: { in: contractCodes } },
              select: { contractCode: true },
            })
          : Promise.resolve([]),
      ]);

    const roomByCode = new Map(rooms.map((r) => [r.roomCode.toLowerCase(), r]));
    const customerByCode = new Map(
      customersByCode.map((c) => [c.customerCode.toLowerCase(), c]),
    );
    /** 名称不唯一时记为 null，导入时记 unlinked */
    const customerByName = new Map<string, { id: string; customerCode: string; name: string } | null>();
    for (const c of customersByName) {
      const key = c.name.trim().toLowerCase();
      if (!key) continue;
      if (customerByName.has(key)) {
        customerByName.set(key, null);
      } else {
        customerByName.set(key, c);
      }
    }
    const reqByCode = new Map(requirements.map((r) => [r.requirementCode.toLowerCase(), r]));
    const userByLabel = new Map<string, string>();
    for (const u of users) {
      const account = u.account.trim().toLowerCase();
      const name = u.displayName.trim().toLowerCase();
      if (account) userByLabel.set(account, u.id);
      if (name) userByLabel.set(name, u.id);
    }
    const seenCodes = new Set(existingContracts.map((c) => c.contractCode.toLowerCase()));

    for (const item of items) {
      const roomCode = s(item.roomCode);
      const customerCode = s(item.customerCode);
      const customerName = s(item.customerName);
      const contractCode = s(item.contractCode);
      const keys = {
        合約編號: contractCode,
        房間編號: roomCode,
        客戶編號: customerCode,
        客戶名稱: customerName,
      };

      if (!roomCode || (!customerCode && !customerName)) {
        skipped += 1;
        pushImportIssue(issues, 'skipped', '缺少房間編號，或缺少客戶編號/客戶名稱', keys);
        continue;
      }

      const room = roomByCode.get(roomCode.toLowerCase());
      let customer =
        (customerCode ? customerByCode.get(customerCode.toLowerCase()) : undefined) ||
        undefined;
      if (!customer && customerName) {
        const byName = customerByName.get(customerName.toLowerCase());
        if (byName === null) {
          unlinked += 1;
          pushImportIssue(issues, 'unlinked', `客戶名稱「${customerName}」不唯一，無法匹配`, keys);
          continue;
        }
        customer = byName;
      }
      if (!room || !customer) {
        unlinked += 1;
        const parts: string[] = [];
        if (!room) parts.push(`房間「${roomCode}」未找到`);
        if (!customer) {
          parts.push(
            customerCode
              ? `客戶編號「${customerCode}」未找到`
              : `客戶名稱「${customerName}」未找到`,
          );
        }
        pushImportIssue(issues, 'unlinked', parts.join('；'), keys);
        continue;
      }

      if (contractCode && seenCodes.has(contractCode.toLowerCase())) {
        skipped += 1;
        pushImportIssue(issues, 'skipped', `合約編號「${contractCode}」已存在`, keys);
        continue;
      }

      const salesLabel = s(item.salesManager).toLowerCase();
      const salesManagerId = salesLabel ? userByLabel.get(salesLabel) || null : null;

      const requirementCode = s(item.requirementCode);
      let requirementId: string | null = null;
      if (requirementCode) {
        const req = reqByCode.get(requirementCode.toLowerCase());
        if (!req || req.customerId !== customer.id) {
          failed += 1;
          pushImportIssue(
            issues,
            'failed',
            `需求編號「${requirementCode}」無效或不屬於該客戶`,
            { ...keys, 需求編號: requirementCode },
          );
          continue;
        }
        requirementId = req.id;
      }

      try {
        await this.create(
          {
            contractCode: contractCode || undefined,
            roomId: room.id,
            customerId: customer.id,
            salesManagerId,
            requirementId,
            startDate: item.startDate ?? null,
            endDate: item.endDate ?? null,
            actualEndDate: item.actualEndDate ?? null,
            leaseType: item.leaseType,
            status: item.status,
            monthlyRent: item.monthlyRent,
            roomDeposit: item.roomDeposit,
            bookingDeposit: item.bookingDeposit,
            paymentCycle: item.paymentCycle,
            electricityRate: item.electricityRate,
            miscDeposit: item.miscDeposit,
            doorKeyQty: item.doorKeyQty,
            mailboxKeyQty: item.mailboxKeyQty,
            roomNameText: item.roomNameText,
            subleaseMark: item.subleaseMark,
            attachment: item.attachment,
            remark: item.remark,
          },
          actor,
        );
        if (contractCode) seenCodes.add(contractCode.toLowerCase());
        created += 1;
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : '建立合約失敗';
        pushImportIssue(issues, 'failed', msg, keys);
      }
    }

    return { created, updated: 0, skipped, failed, unlinked, issues };
  }
}
