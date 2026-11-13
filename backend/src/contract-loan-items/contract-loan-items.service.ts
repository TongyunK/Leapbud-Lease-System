import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BuildingAccessService } from '../building-access/building-access.service';
import {
  CreateContractLoanItemDto,
  ImportContractLoanItemsDto,
  UpdateContractLoanItemDto,
} from './dto/contract-loan-item.dto';
import {
  contractLoanItemInclude,
  toContractLoanItemListDto,
} from './contract-loan-item.mapper';
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
import { actorLabelsOrEmpty } from '../common/audit';
import {
  numberFieldInOrEmpty,
  splitEmptyFilter,
  stringFieldInOrEmpty,
} from '../common/column-filter';
import {
  contractByRoomSelect,
  pickContractFromRoomCandidates,
} from '../common/resolve-contract-by-room';

function s(v?: string | null) {
  return (v ?? '').trim();
}

function decimalField(v: number, field: string): Prisma.Decimal {
  const n = Number(v);
  if (Number.isNaN(n)) throw new BadRequestException(`${field} must be a number`);
  return new Prisma.Decimal(n);
}

function feeSubtotal(
  quantity: Prisma.Decimal,
  unitAmount: Prisma.Decimal,
  subtotal?: number | null,
): Prisma.Decimal {
  if (subtotal != null && !Number.isNaN(Number(subtotal))) {
    return decimalField(subtotal, 'subtotal');
  }
  return new Prisma.Decimal(Number(quantity.toString()) * Number(unitAmount.toString()));
}

function numOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

@Injectable()
export class ContractLoanItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BuildingAccessService,
  ) {}

  async findAll(params: {
    keyword?: string;
    contractId?: string;
    contractCodes?: string[];
    customerNames?: string[];
    quantities?: string[];
    unitAmounts?: string[];
    subtotals?: string[];
    roomCodes?: string[];
    createdBys?: string[];
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    createdAtFrom?: string;
    createdAtTo?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<ReturnType<typeof toContractLoanItemListDto>>> {
    const page = parsePage(params.page);
    const pageSize = parsePageSize(params.pageSize);
    const where = this.buildListWhere(params);
    await this.access.constrain(where, 'viaContractRoom');
    const { skip, take } = paginateArgs(page, pageSize);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contractLoanItem.count({ where }),
      this.prisma.contractLoanItem.findMany({
        where,
        include: contractLoanItemInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...(skip != null ? { skip, take } : {}),
      }),
    ]);

    return {
      items: rows.map(toContractLoanItemListDto),
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    };
  }

  private buildListWhere(params: {
    keyword?: string;
    contractId?: string;
    contractCodes?: string[];
    customerNames?: string[];
    quantities?: string[];
    unitAmounts?: string[];
    subtotals?: string[];
    roomCodes?: string[];
    createdBys?: string[];
    createdAtFrom?: string;
    createdAtTo?: string;
  }): Prisma.ContractLoanItemWhereInput {
    const where: Prisma.ContractLoanItemWhereInput = {};
    if (params.contractId?.trim()) where.contractId = params.contractId.trim();

    const and: Prisma.ContractLoanItemWhereInput[] = [];

    const { values: contractCodes, includeEmpty: includeEmptyContract } = splitEmptyFilter(
      params.contractCodes,
    );
    const { values: customerNames, includeEmpty: includeEmptyCustomer } = splitEmptyFilter(
      params.customerNames,
    );
    const { values: roomCodes, includeEmpty: includeEmptyRoom } = splitEmptyFilter(
      params.roomCodes,
    );
    if (
      contractCodes.length ||
      customerNames.length ||
      roomCodes.length ||
      includeEmptyContract ||
      includeEmptyCustomer ||
      includeEmptyRoom
    ) {
      const contractWhere: Prisma.ContractWhereInput = {};
      const contractCodeClause = stringFieldInOrEmpty('contractCode', params.contractCodes);
      if (contractCodeClause) Object.assign(contractWhere, contractCodeClause);
      const customerNameClause = stringFieldInOrEmpty('name', params.customerNames);
      if (customerNameClause) {
        contractWhere.customer = customerNameClause as Prisma.CustomerWhereInput;
      }
      const roomCodeClause = stringFieldInOrEmpty('roomCode', params.roomCodes);
      if (roomCodeClause) {
        contractWhere.room = roomCodeClause as Prisma.RoomWhereInput;
      }
      and.push({ contract: contractWhere });
    }

    const quantityClause = numberFieldInOrEmpty('quantity', params.quantities);
    if (quantityClause) and.push(quantityClause as Prisma.ContractLoanItemWhereInput);

    const unitAmountClause = numberFieldInOrEmpty('unitAmount', params.unitAmounts);
    if (unitAmountClause) and.push(unitAmountClause as Prisma.ContractLoanItemWhereInput);

    const subtotalClause = numberFieldInOrEmpty('subtotal', params.subtotals);
    if (subtotalClause) and.push(subtotalClause as Prisma.ContractLoanItemWhereInput);

    const createdByClause = actorLabelsOrEmpty('createdBy', params.createdBys);
    if (createdByClause) and.push(createdByClause as Prisma.ContractLoanItemWhereInput);

    if (and.length) where.AND = and;

    const keyword = params.keyword?.trim();
    if (keyword) {
      where.OR = [
        { description: { contains: keyword, mode: 'insensitive' } },
        { remark: { contains: keyword, mode: 'insensitive' } },
        { contract: { contractCode: { contains: keyword, mode: 'insensitive' } } },
        { contract: { customer: { name: { contains: keyword, mode: 'insensitive' } } } },
        { contract: { room: { roomCode: { contains: keyword, mode: 'insensitive' } } } },
        { createdByUser: { account: { contains: keyword, mode: 'insensitive' } } },
        { createdByUser: { displayName: { contains: keyword, mode: 'insensitive' } } },
      ];
    }

    const createdAt = dateRangeFilter(params.createdAtFrom, params.createdAtTo, true);
    if (createdAt) where.createdAt = createdAt;

    return where;
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.ContractLoanItemOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'asc';
    const key = s(sortBy);
    if (!key) return [{ createdAt: 'desc' }, { contract: { contractCode: 'asc' } }, { sortOrder: 'asc' }];
    if (key === 'contractCode') {
      return [{ contract: { contractCode: dir } }, { sortOrder: 'asc' }, { createdAt: 'asc' }];
    }
    if (key === 'description') return [{ description: dir }];
    if (key === 'quantity') return [{ quantity: dir }];
    if (key === 'unitAmount') return [{ unitAmount: dir }];
    if (key === 'subtotal') return [{ subtotal: dir }];
    if (key === 'remark') return [{ remark: dir }];
    if (key === 'customerName') {
      return [{ contract: { customer: { name: dir } } }, { sortOrder: 'asc' }];
    }
    if (key === 'roomCode') {
      return [{ contract: { room: { roomCode: dir } } }, { sortOrder: 'asc' }];
    }
    if (key === 'createdBy') {
      return [{ createdByUser: { displayName: dir } }, { createdByUser: { account: dir } }];
    }
    if (key === 'createdAt') return [{ createdAt: dir }];
    if (key === 'sortOrder') return [{ sortOrder: dir }, { createdAt: 'asc' }];
    return [
      { contract: { contractCode: 'asc' } },
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ];
  }

  async findOne(id: string) {
    const row = await this.prisma.contractLoanItem.findUnique({
      where: { id },
      include: contractLoanItemInclude,
    });
    if (!row) throw new NotFoundException(`Contract loan item ${id} not found`);
    await this.access.assertContractId(row.contractId);
    return toContractLoanItemListDto(row);
  }

  async create(dto: CreateContractLoanItemDto, actor = '') {
    const contract = await this.resolveContract(dto.contractId, dto.contractCode);
    const quantity = decimalField(dto.quantity ?? 0, 'quantity');
    const unitAmount = decimalField(dto.unitAmount ?? 0, 'unitAmount');
    const subtotal = feeSubtotal(quantity, unitAmount, dto.subtotal);
    const actorId = actor || null;

    const row = await this.prisma.contractLoanItem.create({
      data: {
        contractId: contract.id,
        description: s(dto.description),
        quantity,
        unitAmount,
        subtotal,
        remark: s(dto.remark),
        sortOrder: dto.sortOrder != null ? Math.floor(Number(dto.sortOrder)) : 0,
        createdById: actorId,
        updatedById: actorId,
      },
      include: contractLoanItemInclude,
    });
    return toContractLoanItemListDto(row);
  }

  async importBatch(dto: ImportContractLoanItemsDto, actor = '') {
    const items = dto.items || [];
    let created = 0;
    let skipped = 0;
    let failed = 0;
    let unlinked = 0;
    const issues: ImportIssue[] = [];
    const actorId = actor || null;

    const contractCodes = [
      ...new Set(items.map((it) => s(it.contractCode)).filter(Boolean)),
    ];
    const contractIdHints = [
      ...new Set(items.map((it) => s(it.contractId)).filter(Boolean)),
    ];
    const roomCodes = [
      ...new Set(items.map((it) => s(it.roomCode)).filter(Boolean)),
    ];

    const contracts =
      contractCodes.length || contractIdHints.length
        ? await this.prisma.contract.findMany({
            where: {
              OR: [
                ...(contractCodes.length ? [{ contractCode: { in: contractCodes } }] : []),
                ...(contractIdHints.length ? [{ id: { in: contractIdHints } }] : []),
              ],
            },
            select: { id: true, contractCode: true },
          })
        : [];
    const contractByCode = new Map(
      contracts.map((c) => [c.contractCode.toLowerCase(), c]),
    );
    const contractById = new Map(contracts.map((c) => [c.id, c]));

    const rooms = roomCodes.length
      ? await this.prisma.room.findMany({
          where: { roomCode: { in: roomCodes } },
          select: { id: true, roomCode: true },
        })
      : [];
    const roomByCode = new Map(rooms.map((r) => [r.roomCode.toLowerCase(), r]));
    const roomIds = rooms.map((r) => r.id);
    const contractsByRoom = roomIds.length
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

    const seedContractIds = [
      ...new Set([...contracts.map((c) => c.id), ...contractsByRoom.map((c) => c.id)]),
    ];
    const existing = seedContractIds.length
      ? await this.prisma.contractLoanItem.findMany({
          where: { contractId: { in: seedContractIds } },
          select: {
            contractId: true,
            description: true,
            quantity: true,
            unitAmount: true,
            contract: { select: { contractCode: true } },
          },
        })
      : [];
    const seen = new Set(
      existing.map(
        (r) =>
          `${(r.contract?.contractCode || r.contractId).toLowerCase()}|${(r.description || '').toLowerCase()}|${r.quantity.toString()}|${r.unitAmount.toString()}`,
      ),
    );

    for (const item of items) {
      const contractIdHint = s(item.contractId);
      const contractCode = s(item.contractCode);
      const roomCode = s(item.roomCode);
      const customerName = s(item.customerName);
      const description = s(item.description);
      const keys = {
        合約編號: contractCode,
        房間編號: roomCode,
        客戶名稱: customerName,
        費用描述: description,
      };

      if (!contractCode && !contractIdHint && !roomCode) {
        skipped += 1;
        pushImportIssue(
          issues,
          'skipped',
          '缺少合約編號或房間編號等定位字段',
          keys,
        );
        continue;
      }

      let contract: { id: string; contractCode: string } | null = null;

      if (contractIdHint) {
        contract =
          contractById.get(contractIdHint) ||
          (await this.prisma.contract.findUnique({
            where: { id: contractIdHint },
            select: { id: true, contractCode: true },
          }));
      } else if (contractCode) {
        contract = contractByCode.get(contractCode.toLowerCase()) || null;
      } else if (roomCode) {
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
            : contractIdHint
              ? `合約 ID「${contractIdHint}」未找到`
              : '無法解析關聯合約',
          keys,
        );
        continue;
      }

      const quantity = decimalField(numOrZero(item.quantity), 'quantity');
      const unitAmount = decimalField(numOrZero(item.unitAmount), 'unitAmount');
      const subtotal = feeSubtotal(quantity, unitAmount, item.subtotal);

      const dupKey = `${contract.contractCode.toLowerCase()}|${description.toLowerCase()}|${quantity.toString()}|${unitAmount.toString()}`;
      if (seen.has(dupKey)) {
        skipped += 1;
        pushImportIssue(
          issues,
          'skipped',
          `合約「${contract.contractCode}」已存在相同借出物品記錄`,
          { ...keys, 合約編號: contract.contractCode },
        );
        continue;
      }

      try {
        await this.prisma.contractLoanItem.create({
          data: {
            contractId: contract.id,
            description,
            quantity,
            unitAmount,
            subtotal,
            remark: s(item.remark),
            sortOrder: item.sortOrder != null ? Math.floor(Number(item.sortOrder)) : 0,
            createdById: actorId,
            updatedById: actorId,
          },
        });
        seen.add(dupKey);
        created += 1;
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : '建立借出物品失敗';
        pushImportIssue(issues, 'failed', msg, { ...keys, 合約編號: contract.contractCode });
      }
    }

    return { created, updated: 0, skipped, failed, unlinked, issues };
  }

  async update(id: string, dto: UpdateContractLoanItemDto, actor = '') {
    const existing = await this.prisma.contractLoanItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Contract loan item ${id} not found`);

    const contractId =
      dto.contractId !== undefined ? s(dto.contractId) : existing.contractId;
    if (!contractId) throw new BadRequestException('contractId is required');
    await this.assertContract(contractId);

    const quantity =
      dto.quantity !== undefined
        ? decimalField(dto.quantity, 'quantity')
        : existing.quantity;
    const unitAmount =
      dto.unitAmount !== undefined
        ? decimalField(dto.unitAmount, 'unitAmount')
        : existing.unitAmount;
    const subtotal =
      dto.subtotal !== undefined || dto.quantity !== undefined || dto.unitAmount !== undefined
        ? feeSubtotal(
            quantity,
            unitAmount,
            dto.subtotal !== undefined ? dto.subtotal : undefined,
          )
        : existing.subtotal;

    const row = await this.prisma.contractLoanItem.update({
      where: { id },
      data: {
        contractId,
        description: dto.description !== undefined ? s(dto.description) : undefined,
        quantity,
        unitAmount,
        subtotal,
        remark: dto.remark !== undefined ? s(dto.remark) : undefined,
        sortOrder: dto.sortOrder !== undefined ? Math.floor(Number(dto.sortOrder)) : undefined,
        ...(actor ? { updatedById: actor } : {}),
      },
      include: contractLoanItemInclude,
    });
    return toContractLoanItemListDto(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.contractLoanItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Contract loan item ${id} not found`);
    await this.prisma.contractLoanItem.delete({ where: { id } });
    return { success: true };
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }

  private async resolveContract(contractId?: string | null, contractCode?: string | null) {
    const id = s(contractId);
    const code = s(contractCode);
    if (id) {
      const row = await this.prisma.contract.findUnique({
        where: { id },
        select: { id: true, contractCode: true },
      });
      if (!row) throw new BadRequestException('Invalid contractId');
      return row;
    }
    if (code) {
      const row = await this.prisma.contract.findUnique({
        where: { contractCode: code },
        select: { id: true, contractCode: true },
      });
      if (!row) throw new BadRequestException('Invalid contractCode');
      return row;
    }
    throw new BadRequestException('contractId or contractCode is required');
  }

  private async assertContract(contractId: string) {
    const row = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    if (!row) throw new BadRequestException('Invalid contractId');
    return row;
  }
}
