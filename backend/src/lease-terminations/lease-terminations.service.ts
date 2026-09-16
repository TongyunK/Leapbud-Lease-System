import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLeaseTerminationDto,
  ImportLeaseTerminationsDto,
  LeaseTerminationOtherFeeDto,
  UpdateLeaseTerminationDto,
} from './dto/lease-termination.dto';
import {
  leaseTerminationInclude,
  toLeaseTerminationListDto,
} from './lease-termination.mapper';
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
import {
  contractByRoomSelect,
  pickContractFromRoomCandidates,
} from '../common/resolve-contract-by-room';

function s(v?: string | null) {
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

function nonNegInt(v: unknown, field: string): number {
  const n = Math.floor(Number(v ?? 0) || 0);
  if (n < 0) throw new BadRequestException(`${field} must be >= 0`);
  return n;
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

@Injectable()
export class LeaseTerminationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    keyword?: string;
    contractId?: string;
    customerNames?: string[];
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    terminationDateFrom?: string;
    terminationDateTo?: string;
    createdAtFrom?: string;
    createdAtTo?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<ReturnType<typeof toLeaseTerminationListDto>>> {
    const page = parsePage(params.page);
    const pageSize = parsePageSize(params.pageSize);
    const where = this.buildListWhere(params);
    const { skip, take } = paginateArgs(page, pageSize);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.leaseTermination.count({ where }),
      this.prisma.leaseTermination.findMany({
        where,
        include: leaseTerminationInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...(skip != null ? { skip, take } : {}),
      }),
    ]);

    return {
      items: rows.map(toLeaseTerminationListDto),
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    };
  }

  private buildListWhere(params: {
    keyword?: string;
    contractId?: string;
    customerNames?: string[];
    terminationDateFrom?: string;
    terminationDateTo?: string;
    createdAtFrom?: string;
    createdAtTo?: string;
  }): Prisma.LeaseTerminationWhereInput {
    const where: Prisma.LeaseTerminationWhereInput = {};
    if (params.contractId?.trim()) where.contractId = params.contractId.trim();
    const customerNames = (params.customerNames || []).map((v) => (v ?? '').trim()).filter(Boolean);
    if (customerNames.length) {
      where.customer = { name: { in: customerNames } };
    }

    const keyword = params.keyword?.trim();
    if (keyword) {
      where.OR = [
        { terminationCode: { contains: keyword, mode: 'insensitive' } },
        { reason: { contains: keyword, mode: 'insensitive' } },
        { siteCondition: { contains: keyword, mode: 'insensitive' } },
        { remark: { contains: keyword, mode: 'insensitive' } },
        { relatedDepositRefund: { contains: keyword, mode: 'insensitive' } },
        { contract: { contractCode: { contains: keyword, mode: 'insensitive' } } },
        { customer: { name: { contains: keyword, mode: 'insensitive' } } },
        { customer: { customerCode: { contains: keyword, mode: 'insensitive' } } },
        { room: { roomCode: { contains: keyword, mode: 'insensitive' } } },
        { room: { name: { contains: keyword, mode: 'insensitive' } } },
        { createdByUser: { account: { contains: keyword, mode: 'insensitive' } } },
        { createdByUser: { displayName: { contains: keyword, mode: 'insensitive' } } },
      ];
    }

    const terminationDate = dateRangeFilter(
      params.terminationDateFrom,
      params.terminationDateTo,
    );
    if (terminationDate) where.terminationDate = terminationDate;
    const createdAt = dateRangeFilter(params.createdAtFrom, params.createdAtTo, true);
    if (createdAt) where.createdAt = createdAt;

    return where;
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.LeaseTerminationOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'desc';
    const key = s(sortBy);
    if (key === 'terminationCode') return [{ terminationCode: dir }];
    if (key === 'contractCode') return [{ contract: { contractCode: dir } }];
    if (key === 'customerName') return [{ customer: { name: dir } }];
    if (key === 'roomCode') return [{ room: { roomCode: dir } }];
    if (key === 'reason') return [{ reason: dir }];
    if (key === 'terminationDate') return [{ terminationDate: dir }, { terminationCode: 'desc' }];
    if (key === 'doorKeyReturnedQty') return [{ doorKeyReturnedQty: dir }];
    if (key === 'smartCardReturnedQty') return [{ smartCardReturnedQty: dir }];
    if (key === 'relatedDepositRefund') return [{ relatedDepositRefund: dir }];
    if (key === 'createdBy') {
      return [{ createdByUser: { displayName: dir } }, { createdByUser: { account: dir } }];
    }
    if (key === 'createdAt') return [{ createdAt: dir }];
    return [{ terminationDate: 'desc' }, { terminationCode: 'desc' }];
  }

  async findOne(id: string) {
    const row = await this.prisma.leaseTermination.findUnique({
      where: { id },
      include: leaseTerminationInclude,
    });
    if (!row) throw new NotFoundException(`Lease termination ${id} not found`);
    return toLeaseTerminationListDto(row);
  }

  async create(dto: CreateLeaseTerminationDto, actor = '') {
    const contract = await this.resolveContract(dto.contractId, dto.contractCode);
    const { customerId, roomId } = await this.resolveCustomerRoom(
      contract,
      dto.customerId,
      dto.roomId,
    );
    const terminationCode = s(dto.terminationCode) || (await this.nextTerminationCode());
    const actorId = actor || null;

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.leaseTermination.create({
          data: {
            terminationCode,
            contractId: contract.id,
            customerId,
            roomId,
            reason: s(dto.reason),
            terminationDate: parseDateOnly(dto.terminationDate, 'terminationDate'),
            noticeAttachment: s(dto.noticeAttachment),
            doorKeyReturnedQty: nonNegInt(dto.doorKeyReturnedQty, 'doorKeyReturnedQty'),
            smartCardReturnedQty: nonNegInt(dto.smartCardReturnedQty, 'smartCardReturnedQty'),
            siteCondition: s(dto.siteCondition),
            remark: s(dto.remark),
            relatedDepositRefund: s(dto.relatedDepositRefund),
            createdById: actorId,
            updatedById: actorId,
          },
        });
        await this.replaceOtherFees(tx, created.id, contract.id, dto.otherFees, actorId);
        return tx.leaseTermination.findUniqueOrThrow({
          where: { id: created.id },
          include: leaseTerminationInclude,
        });
      });
      return toLeaseTerminationListDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Termination code「${terminationCode}」already exists`);
      }
      throw e;
    }
  }

  async importBatch(dto: ImportLeaseTerminationsDto, actor = '') {
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
    const roomCodes = [
      ...new Set(items.map((it) => s(it.roomCode)).filter(Boolean)),
    ];

    const contracts = contractCodes.length
      ? await this.prisma.contract.findMany({
          where: { contractCode: { in: contractCodes } },
          select: { id: true, contractCode: true, customerId: true, roomId: true },
        })
      : [];
    const contractByCode = new Map(
      contracts.map((c) => [c.contractCode.toLowerCase(), c]),
    );

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

    const codeHints = [
      ...new Set(items.map((it) => s(it.terminationCode)).filter(Boolean)),
    ];
    const existingCodes = new Set(
      codeHints.length
        ? (
            await this.prisma.leaseTermination.findMany({
              where: { terminationCode: { in: codeHints } },
              select: { terminationCode: true },
            })
          ).map((r) => r.terminationCode.toLowerCase())
        : [],
    );

    for (const item of items) {
      const contractId = s(item.contractId);
      const contractCode = s(item.contractCode);
      const roomCode = s(item.roomCode);
      const customerName = s(item.customerName);
      const terminationCode = s(item.terminationCode);
      const keys = {
        退租編號: terminationCode,
        合約編號: contractCode,
        房間編號: roomCode,
        客戶名稱: customerName,
      };

      if (!contractCode && !contractId && !roomCode) {
        skipped += 1;
        pushImportIssue(issues, 'skipped', '缺少合約編號、合約 ID 或房間編號', keys);
        continue;
      }

      let contract: {
        id: string;
        contractCode: string;
        customerId: string;
        roomId: string;
      } | null = null;

      if (contractId) {
        contract = await this.prisma.contract.findUnique({
          where: { id: contractId },
          select: { id: true, contractCode: true, customerId: true, roomId: true },
        });
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
        contract = {
          id: picked.id,
          contractCode: picked.contractCode,
          customerId: picked.customerId,
          roomId: picked.roomId,
        };
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

      if (terminationCode && existingCodes.has(terminationCode.toLowerCase())) {
        skipped += 1;
        pushImportIssue(issues, 'skipped', `退租編號「${terminationCode}」已存在`, keys);
        continue;
      }

      try {
        const { customerId, roomId } = await this.resolveCustomerRoom(
          contract,
          item.customerId,
          item.roomId,
        );
        const code = terminationCode || (await this.nextTerminationCode());
        await this.prisma.leaseTermination.create({
          data: {
            terminationCode: code,
            contractId: contract.id,
            customerId,
            roomId,
            reason: s(item.reason),
            terminationDate: parseDateOnly(item.terminationDate, 'terminationDate'),
            noticeAttachment: s(item.noticeAttachment),
            doorKeyReturnedQty: nonNegInt(item.doorKeyReturnedQty, 'doorKeyReturnedQty'),
            smartCardReturnedQty: nonNegInt(item.smartCardReturnedQty, 'smartCardReturnedQty'),
            siteCondition: s(item.siteCondition),
            remark: s(item.remark),
            relatedDepositRefund: s(item.relatedDepositRefund),
            createdById: actorId,
            updatedById: actorId,
          },
        });
        existingCodes.add(code.toLowerCase());
        created += 1;
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : '建立退租記錄失敗';
        pushImportIssue(issues, 'failed', msg, { ...keys, 合約編號: contract.contractCode });
      }
    }

    return { created, updated: 0, skipped, failed, unlinked, issues };
  }

  async update(id: string, dto: UpdateLeaseTerminationDto, actor = '') {
    const existing = await this.prisma.leaseTermination.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Lease termination ${id} not found`);

    let contract = await this.assertContract(existing.contractId);
    if (dto.contractId !== undefined) {
      contract = await this.assertContract(dto.contractId);
    }

    const { customerId, roomId } = await this.resolveCustomerRoom(
      contract,
      dto.customerId !== undefined ? dto.customerId : existing.customerId,
      dto.roomId !== undefined ? dto.roomId : existing.roomId,
    );

    const terminationCode =
      dto.terminationCode !== undefined ? s(dto.terminationCode) : existing.terminationCode;
    if (!terminationCode) throw new BadRequestException('terminationCode is required');

    const actorId = actor || null;

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.leaseTermination.update({
          where: { id },
          data: {
            terminationCode,
            contractId: contract.id,
            customerId,
            roomId,
            reason: dto.reason !== undefined ? s(dto.reason) : undefined,
            terminationDate:
              dto.terminationDate !== undefined
                ? parseDateOnly(dto.terminationDate, 'terminationDate')
                : undefined,
            noticeAttachment: dto.noticeAttachment !== undefined ? s(dto.noticeAttachment) : undefined,
            doorKeyReturnedQty:
              dto.doorKeyReturnedQty !== undefined
                ? nonNegInt(dto.doorKeyReturnedQty, 'doorKeyReturnedQty')
                : undefined,
            smartCardReturnedQty:
              dto.smartCardReturnedQty !== undefined
                ? nonNegInt(dto.smartCardReturnedQty, 'smartCardReturnedQty')
                : undefined,
            siteCondition: dto.siteCondition !== undefined ? s(dto.siteCondition) : undefined,
            remark: dto.remark !== undefined ? s(dto.remark) : undefined,
            relatedDepositRefund:
              dto.relatedDepositRefund !== undefined ? s(dto.relatedDepositRefund) : undefined,
            ...(actorId ? { updatedById: actorId } : {}),
          },
        });
        await this.replaceOtherFees(tx, id, contract.id, dto.otherFees, actorId);
        return tx.leaseTermination.findUniqueOrThrow({
          where: { id },
          include: leaseTerminationInclude,
        });
      });
      return toLeaseTerminationListDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Termination code「${terminationCode}」already exists`);
      }
      throw e;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.leaseTermination.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Lease termination ${id} not found`);
    await this.prisma.$transaction(async (tx) => {
      await tx.contractOtherFee.deleteMany({ where: { terminationId: id } });
      await tx.leaseTermination.delete({ where: { id } });
    });
    return { success: true };
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }

  private async nextTerminationCode() {
    const now = new Date();
    const y = String(now.getFullYear()).slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const prefix = `TRM${y}${m}${d}`;
    const latest = await this.prisma.leaseTermination.findFirst({
      where: { terminationCode: { startsWith: prefix } },
      orderBy: { terminationCode: 'desc' },
      select: { terminationCode: true },
    });
    let seq = 1;
    if (latest) {
      const n = Number(latest.terminationCode.slice(prefix.length));
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async resolveContract(contractId?: string | null, contractCode?: string | null) {
    const id = s(contractId);
    const code = s(contractCode);
    if (id) {
      const row = await this.prisma.contract.findUnique({
        where: { id },
        select: { id: true, contractCode: true, customerId: true, roomId: true },
      });
      if (!row) throw new BadRequestException('Invalid contractId');
      return row;
    }
    if (code) {
      const row = await this.prisma.contract.findUnique({
        where: { contractCode: code },
        select: { id: true, contractCode: true, customerId: true, roomId: true },
      });
      if (!row) throw new BadRequestException('Invalid contractCode');
      return row;
    }
    throw new BadRequestException('contractId or contractCode is required');
  }

  private async assertContract(contractId: string) {
    const id = s(contractId);
    if (!id) throw new BadRequestException('contractId is required');
    const row = await this.prisma.contract.findUnique({
      where: { id },
      select: { id: true, contractCode: true, customerId: true, roomId: true },
    });
    if (!row) throw new BadRequestException('Invalid contractId');
    return row;
  }

  private async resolveCustomerRoom(
    contract: { customerId: string; roomId: string },
    dtoCustomerId?: string | null,
    dtoRoomId?: string | null,
  ) {
    let customerId = s(dtoCustomerId);
    let roomId = s(dtoRoomId);
    if (!customerId) customerId = contract.customerId;
    if (!roomId) roomId = contract.roomId;

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) throw new BadRequestException('Invalid customerId');

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true },
    });
    if (!room) throw new BadRequestException('Invalid roomId');

    return { customerId, roomId };
  }

  private async replaceOtherFees(
    tx: Prisma.TransactionClient,
    terminationId: string,
    contractId: string,
    fees: LeaseTerminationOtherFeeDto[] | undefined,
    actorId: string | null,
  ) {
    if (fees === undefined) return;

    await tx.contractOtherFee.deleteMany({ where: { terminationId } });
    if (!fees.length) return;

    for (let i = 0; i < fees.length; i++) {
      const f = fees[i];
      const description = s(f.description);
      if (!description) throw new BadRequestException('otherFees[].description is required');

      const quantity = decimalField(f.quantity, 'otherFees[].quantity');
      const unitAmount = decimalField(f.unitAmount, 'otherFees[].unitAmount');
      const subtotal = feeSubtotal(quantity, unitAmount, f.subtotal);

      await tx.contractOtherFee.create({
        data: {
          contractId,
          terminationId,
          description,
          quantity,
          unitAmount,
          subtotal,
          remark: s(f.remark),
          sortOrder: f.sortOrder != null ? Math.floor(Number(f.sortOrder)) : i,
          createdById: actorId,
          updatedById: actorId,
        },
      });
    }
  }
}
