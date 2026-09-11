import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateContractOtherFeeDto,
  ImportContractOtherFeesDto,
  UpdateContractOtherFeeDto,
} from './dto/contract-other-fee.dto';
import {
  contractOtherFeeInclude,
  toContractOtherFeeListDto,
} from './contract-other-fee.mapper';
import {
  dateRangeFilter,
  paginateArgs,
  parsePage,
  parsePageSize,
  parseSortDir,
  type PaginatedResult,
} from '../common/pagination';
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
export class ContractOtherFeesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    keyword?: string;
    contractId?: string;
    terminationId?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    createdAtFrom?: string;
    createdAtTo?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<ReturnType<typeof toContractOtherFeeListDto>>> {
    const page = parsePage(params.page);
    const pageSize = parsePageSize(params.pageSize);
    const where = this.buildListWhere(params);
    const { skip, take } = paginateArgs(page, pageSize);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contractOtherFee.count({ where }),
      this.prisma.contractOtherFee.findMany({
        where,
        include: contractOtherFeeInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...(skip != null ? { skip, take } : {}),
      }),
    ]);

    return {
      items: rows.map(toContractOtherFeeListDto),
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    };
  }

  private buildListWhere(params: {
    keyword?: string;
    contractId?: string;
    terminationId?: string;
    createdAtFrom?: string;
    createdAtTo?: string;
  }): Prisma.ContractOtherFeeWhereInput {
    const where: Prisma.ContractOtherFeeWhereInput = {};
    if (params.contractId?.trim()) where.contractId = params.contractId.trim();
    if (params.terminationId?.trim()) where.terminationId = params.terminationId.trim();

    const keyword = params.keyword?.trim();
    if (keyword) {
      where.OR = [
        { description: { contains: keyword, mode: 'insensitive' } },
        { remark: { contains: keyword, mode: 'insensitive' } },
        { contract: { contractCode: { contains: keyword, mode: 'insensitive' } } },
        { termination: { terminationCode: { contains: keyword, mode: 'insensitive' } } },
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
  ): Prisma.ContractOtherFeeOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'asc';
    const key = s(sortBy);
    if (key === 'contractCode') {
      return [{ contract: { contractCode: dir } }, { sortOrder: 'asc' }, { createdAt: 'asc' }];
    }
    if (key === 'terminationCode') {
      return [{ termination: { terminationCode: dir } }, { sortOrder: 'asc' }];
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
    const row = await this.prisma.contractOtherFee.findUnique({
      where: { id },
      include: contractOtherFeeInclude,
    });
    if (!row) throw new NotFoundException(`Contract other fee ${id} not found`);
    return toContractOtherFeeListDto(row);
  }

  async create(dto: CreateContractOtherFeeDto, actor = '') {
    const contract = await this.resolveContract(dto.contractId, dto.contractCode);
    const terminationId = await this.resolveTerminationId(
      contract.id,
      dto.terminationId,
      dto.terminationCode,
    );
    const quantity = decimalField(dto.quantity ?? 0, 'quantity');
    const unitAmount = decimalField(dto.unitAmount ?? 0, 'unitAmount');
    const subtotal = feeSubtotal(quantity, unitAmount, dto.subtotal);
    const actorId = actor || null;

    const row = await this.prisma.contractOtherFee.create({
      data: {
        contractId: contract.id,
        terminationId,
        description: s(dto.description),
        quantity,
        unitAmount,
        subtotal,
        remark: s(dto.remark),
        sortOrder: dto.sortOrder != null ? Math.floor(Number(dto.sortOrder)) : 0,
        createdById: actorId,
        updatedById: actorId,
      },
      include: contractOtherFeeInclude,
    });
    return toContractOtherFeeListDto(row);
  }

  async importBatch(dto: ImportContractOtherFeesDto, actor = '') {
    const items = dto.items || [];
    let created = 0;
    let skipped = 0;
    let failed = 0;
    let unlinked = 0;
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
    const terminationCodes = [
      ...new Set(items.map((it) => s(it.terminationCode)).filter(Boolean)),
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

    const terminations = terminationCodes.length
      ? await this.prisma.leaseTermination.findMany({
          where: { terminationCode: { in: terminationCodes } },
          select: {
            id: true,
            terminationCode: true,
            contractId: true,
            contract: { select: { id: true, contractCode: true } },
          },
        })
      : [];
    const terminationByCode = new Map(
      terminations.map((t) => [t.terminationCode.toLowerCase(), t]),
    );

    // 预载可能涉及的合约上的既有费用（含退租反查 / 房间反查得到的合约）
    const seedContractIds = [
      ...new Set([
        ...contracts.map((c) => c.id),
        ...contractsByRoom.map((c) => c.id),
        ...terminations.map((t) => t.contractId),
      ]),
    ];
    const existing = seedContractIds.length
      ? await this.prisma.contractOtherFee.findMany({
          where: { contractId: { in: seedContractIds } },
          select: {
            contractId: true,
            terminationId: true,
            description: true,
            quantity: true,
            unitAmount: true,
            contract: { select: { contractCode: true } },
            termination: { select: { terminationCode: true } },
          },
        })
      : [];
    const seen = new Set(
      existing.map(
        (r) =>
          `${(r.contract?.contractCode || r.contractId).toLowerCase()}|${(r.termination?.terminationCode || '').toLowerCase()}|${(r.description || '').toLowerCase()}|${r.quantity.toString()}|${r.unitAmount.toString()}`,
      ),
    );

    for (const item of items) {
      const contractIdHint = s(item.contractId);
      const contractCode = s(item.contractCode);
      const roomCode = s(item.roomCode);
      const customerName = s(item.customerName);
      const termId = s(item.terminationId);
      const termCode = s(item.terminationCode);

      if (!contractCode && !contractIdHint && !roomCode && !termCode && !termId) {
        skipped += 1;
        continue;
      }

      let contract: { id: string; contractCode: string } | null = null;
      let terminationId: string | null = null;
      let resolvedTermCode = termCode;

      if (contractIdHint) {
        contract =
          contractById.get(contractIdHint) ||
          (await this.prisma.contract.findUnique({
            where: { id: contractIdHint },
            select: { id: true, contractCode: true },
          }));
      } else if (contractCode) {
        contract = contractByCode.get(contractCode.toLowerCase()) || null;
      } else if (termCode || termId) {
        // 仅有退租编号：用退租反查合约
        const termination = termId
          ? await this.prisma.leaseTermination.findUnique({
              where: { id: termId },
              select: {
                id: true,
                contractId: true,
                terminationCode: true,
                contract: { select: { id: true, contractCode: true } },
              },
            })
          : terminationByCode.get(termCode.toLowerCase()) || null;
        if (!termination?.contract) {
          unlinked += 1;
          continue;
        }
        contract = termination.contract;
        terminationId = termination.id;
        resolvedTermCode = termination.terminationCode;
      } else if (roomCode) {
        const room = roomByCode.get(roomCode.toLowerCase());
        if (!room) {
          unlinked += 1;
          continue;
        }
        const picked = pickContractFromRoomCandidates(
          contractsForRoom.get(room.id) || [],
          customerName || undefined,
        );
        if (!picked) {
          unlinked += 1;
          continue;
        }
        contract = { id: picked.id, contractCode: picked.contractCode };
      }

      if (!contract) {
        unlinked += 1;
        continue;
      }

      // 已有合约时再校验/绑定退租（避免重复解析）
      if (terminationId == null && (termId || termCode)) {
        const termination = termId
          ? await this.prisma.leaseTermination.findUnique({
              where: { id: termId },
              select: { id: true, contractId: true, terminationCode: true },
            })
          : terminationByCode.get(termCode.toLowerCase()) || null;
        if (!termination || termination.contractId !== contract.id) {
          failed += 1;
          continue;
        }
        terminationId = termination.id;
        resolvedTermCode = termination.terminationCode;
      }

      const description = s(item.description);
      const quantity = decimalField(numOrZero(item.quantity), 'quantity');
      const unitAmount = decimalField(numOrZero(item.unitAmount), 'unitAmount');
      const subtotal = feeSubtotal(quantity, unitAmount, item.subtotal);

      const dupKey = `${contract.contractCode.toLowerCase()}|${(resolvedTermCode || '').toLowerCase()}|${description.toLowerCase()}|${quantity.toString()}|${unitAmount.toString()}`;
      if (seen.has(dupKey)) {
        skipped += 1;
        continue;
      }

      try {
        await this.prisma.contractOtherFee.create({
          data: {
            contractId: contract.id,
            terminationId,
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
      } catch {
        failed += 1;
      }
    }

    return { created, updated: 0, skipped, failed, unlinked };
  }

  async update(id: string, dto: UpdateContractOtherFeeDto, actor = '') {
    const existing = await this.prisma.contractOtherFee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Contract other fee ${id} not found`);

    const contractId =
      dto.contractId !== undefined ? s(dto.contractId) : existing.contractId;
    if (!contractId) throw new BadRequestException('contractId is required');
    await this.assertContract(contractId);

    const terminationId =
      dto.terminationId !== undefined
        ? await this.resolveTerminationId(contractId, dto.terminationId, undefined)
        : existing.terminationId;

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

    const row = await this.prisma.contractOtherFee.update({
      where: { id },
      data: {
        contractId,
        terminationId,
        description: dto.description !== undefined ? s(dto.description) : undefined,
        quantity,
        unitAmount,
        subtotal,
        remark: dto.remark !== undefined ? s(dto.remark) : undefined,
        sortOrder: dto.sortOrder !== undefined ? Math.floor(Number(dto.sortOrder)) : undefined,
        ...(actor ? { updatedById: actor } : {}),
      },
      include: contractOtherFeeInclude,
    });
    return toContractOtherFeeListDto(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.contractOtherFee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Contract other fee ${id} not found`);
    await this.prisma.contractOtherFee.delete({ where: { id } });
    return { success: true };
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

  private async resolveTerminationId(
    contractId: string,
    terminationId?: string | null,
    terminationCode?: string | null,
  ): Promise<string | null> {
    const id = s(terminationId);
    const code = s(terminationCode);
    if (!id && !code) return null;

    const termination = id
      ? await this.prisma.leaseTermination.findUnique({
          where: { id },
          select: { id: true, contractId: true },
        })
      : await this.prisma.leaseTermination.findUnique({
          where: { terminationCode: code },
          select: { id: true, contractId: true },
        });
    if (!termination) throw new BadRequestException('Invalid terminationId/terminationCode');
    if (termination.contractId !== contractId) {
      throw new BadRequestException('termination does not belong to contract');
    }
    return termination.id;
  }
}
