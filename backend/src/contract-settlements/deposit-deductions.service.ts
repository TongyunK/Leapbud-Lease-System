import { Injectable, NotFoundException } from '@nestjs/common'
import {
  ContractSettlementItemType,
  Prisma,
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { BuildingAccessService } from '../building-access/building-access.service'
import { auditActorLabel, auditUserInclude } from '../common/audit'
import {
  dateRangeFilter,
  paginateArgs,
  parsePage,
  parsePageSize,
  parseSortDir,
  type PaginatedResult,
} from '../common/pagination'
import {
  numberFieldInOrEmpty,
  splitEmptyFilter,
  stringFieldInOrEmpty,
} from '../common/column-filter'
import { actorLabelsOrEmpty } from '../common/audit'
import { BOOKING_OFFSET_EXCESS_REMARK } from './settlement-item.constants'

const DEDUCTION_TYPES: ContractSettlementItemType[] = [
  ContractSettlementItemType.DAMAGE_DEDUCTION,
  ContractSettlementItemType.PENALTY_DEDUCTION,
]

function s(v?: string | null) {
  return (v ?? '').trim()
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  return Number(value.toString())
}

const deductionItemInclude = {
  settlement: {
    select: {
      id: true,
      settlementCode: true,
      contractId: true,
      customerId: true,
      roomId: true,
      contract: { select: { id: true, contractCode: true } },
      customer: { select: { id: true, customerCode: true, name: true } },
      room: { select: { id: true, roomCode: true, name: true } },
    },
  },
  sourceLoanItem: {
    select: { id: true, description: true },
  },
  ...auditUserInclude,
} as const

@Injectable()
export class DepositDeductionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BuildingAccessService,
  ) {}

  async findAll(params: {
    keyword?: string
    contractId?: string
    contractCodes?: string[]
    customerNames?: string[]
    settlementId?: string
    settlementCodes?: string[]
    quantities?: string[]
    unitAmounts?: string[]
    amounts?: string[]
    roomCodes?: string[]
    returnStatuses?: string[]
    itemTypes?: string[]
    createdBys?: string[]
    sortBy?: string
    sortDir?: 'asc' | 'desc'
    createdAtFrom?: string
    createdAtTo?: string
    page?: number
    pageSize?: number
  }): Promise<PaginatedResult<ReturnType<DepositDeductionsService['toDto']>>> {
    const page = parsePage(params.page)
    const pageSize = parsePageSize(params.pageSize)
    const where = await this.buildListWhere(params)
    const { skip, take } = paginateArgs(page, pageSize)

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contractSettlementItem.count({ where }),
      this.prisma.contractSettlementItem.findMany({
        where,
        include: deductionItemInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...(skip != null ? { skip, take } : {}),
      }),
    ])

    return {
      items: rows.map((r) => this.toDto(r)),
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    }
  }

  async findOne(id: string) {
    const row = await this.prisma.contractSettlementItem.findUnique({
      where: { id },
      include: deductionItemInclude,
    })
    if (
      !row ||
      !DEDUCTION_TYPES.includes(row.itemType) ||
      s(row.remark) === BOOKING_OFFSET_EXCESS_REMARK
    ) {
      throw new NotFoundException(`Deposit deduction ${id} not found`)
    }
    await this.access.assertContractId(row.settlement?.contractId)
    return this.toDto(row)
  }

  private toDto(
    row: Prisma.ContractSettlementItemGetPayload<{ include: typeof deductionItemInclude }>,
  ) {
    const st = row.settlement
    return {
      id: row.id,
      settlementId: row.settlementId,
      settlementCode: st?.settlementCode ?? '',
      contractId: st?.contractId ?? '',
      contractCode: st?.contract?.contractCode ?? '',
      customerId: st?.customerId ?? '',
      customerName: st?.customer?.name ?? '',
      roomId: st?.roomId ?? '',
      roomCode: st?.room?.roomCode ?? '',
      itemType: row.itemType,
      description: row.description,
      quantity: decimalToNumber(row.quantity),
      unitAmount: decimalToNumber(row.unitAmount),
      amount: decimalToNumber(row.amount),
      subtotal: decimalToNumber(row.amount),
      returnStatus: row.returnStatus || '',
      sourceLoanItemId: row.sourceLoanItemId,
      sourceLoanItemDescription: row.sourceLoanItem?.description ?? '',
      remark: row.remark ?? '',
      sortOrder: row.sortOrder,
      createdBy: auditActorLabel(row.createdByUser),
      updatedBy: auditActorLabel(row.updatedByUser),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private async buildListWhere(params: {
    keyword?: string
    contractId?: string
    contractCodes?: string[]
    customerNames?: string[]
    settlementId?: string
    settlementCodes?: string[]
    quantities?: string[]
    unitAmounts?: string[]
    amounts?: string[]
    roomCodes?: string[]
    returnStatuses?: string[]
    itemTypes?: string[]
    createdBys?: string[]
    createdAtFrom?: string
    createdAtTo?: string
  }): Promise<Prisma.ContractSettlementItemWhereInput> {
    const where: Prisma.ContractSettlementItemWhereInput = {
      itemType: { in: DEDUCTION_TYPES },
      // 排除定金抵扣行（含历史误记为 PENALTY + booking_offset_excess）
      NOT: { remark: BOOKING_OFFSET_EXCESS_REMARK },
    }
    const and: Prisma.ContractSettlementItemWhereInput[] = []

    if (params.settlementId?.trim()) {
      where.settlementId = params.settlementId.trim()
    }

    const settlementWhere: Prisma.ContractSettlementWhereInput = {}
    if (params.contractId?.trim()) {
      settlementWhere.contractId = params.contractId.trim()
    }

    const { values: contractCodes, includeEmpty: includeEmptyContract } = splitEmptyFilter(
      params.contractCodes,
    )
    const { values: customerNames, includeEmpty: includeEmptyCustomer } = splitEmptyFilter(
      params.customerNames,
    )
    const { values: roomCodes, includeEmpty: includeEmptyRoom } = splitEmptyFilter(
      params.roomCodes,
    )
    if (
      contractCodes.length ||
      customerNames.length ||
      roomCodes.length ||
      includeEmptyContract ||
      includeEmptyCustomer ||
      includeEmptyRoom
    ) {
      const contractCodeClause = stringFieldInOrEmpty('contractCode', params.contractCodes)
      if (contractCodeClause) {
        settlementWhere.contract = {
          ...(settlementWhere.contract as Prisma.ContractWhereInput | undefined),
          ...contractCodeClause,
        }
      }
      const customerNameClause = stringFieldInOrEmpty('name', params.customerNames)
      if (customerNameClause) {
        settlementWhere.customer = customerNameClause as Prisma.CustomerWhereInput
      }
      const roomCodeClause = stringFieldInOrEmpty('roomCode', params.roomCodes)
      if (roomCodeClause) {
        settlementWhere.room = roomCodeClause as Prisma.RoomWhereInput
      }
    }

    const settlementCodeClause = stringFieldInOrEmpty(
      'settlementCode',
      params.settlementCodes,
    )
    if (settlementCodeClause) {
      Object.assign(settlementWhere, settlementCodeClause)
    }

    const buildingIds = await this.access.viewIds()
    if (buildingIds != null) {
      settlementWhere.room = {
        ...(settlementWhere.room as Prisma.RoomWhereInput | undefined),
        buildingId: { in: buildingIds },
      }
    }

    if (Object.keys(settlementWhere).length) {
      and.push({ settlement: settlementWhere })
    }

    if (params.itemTypes?.length) {
      const types = params.itemTypes
        .map((t) => s(t).toUpperCase())
        .filter((t) =>
          DEDUCTION_TYPES.includes(t as ContractSettlementItemType),
        ) as ContractSettlementItemType[]
      if (types.length) where.itemType = { in: types }
    }

    const { values: returnStatuses, includeEmpty: includeEmptyReturn } = splitEmptyFilter(
      params.returnStatuses,
    )
    if (returnStatuses.length || includeEmptyReturn) {
      const returnClause = stringFieldInOrEmpty('returnStatus', params.returnStatuses)
      if (returnClause) and.push(returnClause as Prisma.ContractSettlementItemWhereInput)
    }

    const quantityClause = numberFieldInOrEmpty('quantity', params.quantities)
    if (quantityClause) and.push(quantityClause as Prisma.ContractSettlementItemWhereInput)

    const unitAmountClause = numberFieldInOrEmpty('unitAmount', params.unitAmounts)
    if (unitAmountClause) and.push(unitAmountClause as Prisma.ContractSettlementItemWhereInput)

    const amountClause = numberFieldInOrEmpty('amount', params.amounts)
    if (amountClause) and.push(amountClause as Prisma.ContractSettlementItemWhereInput)

    const createdByClause = actorLabelsOrEmpty('createdBy', params.createdBys)
    if (createdByClause) and.push(createdByClause as Prisma.ContractSettlementItemWhereInput)

    if (and.length) where.AND = and

    const keyword = params.keyword?.trim()
    if (keyword) {
      where.OR = [
        { description: { contains: keyword, mode: 'insensitive' } },
        { remark: { contains: keyword, mode: 'insensitive' } },
        { returnStatus: { contains: keyword, mode: 'insensitive' } },
        { settlement: { settlementCode: { contains: keyword, mode: 'insensitive' } } },
        { settlement: { contract: { contractCode: { contains: keyword, mode: 'insensitive' } } } },
        { settlement: { customer: { name: { contains: keyword, mode: 'insensitive' } } } },
        { settlement: { room: { roomCode: { contains: keyword, mode: 'insensitive' } } } },
        { createdByUser: { account: { contains: keyword, mode: 'insensitive' } } },
        { createdByUser: { displayName: { contains: keyword, mode: 'insensitive' } } },
      ]
    }

    const createdAt = dateRangeFilter(params.createdAtFrom, params.createdAtTo, true)
    if (createdAt) where.createdAt = createdAt

    return where
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.ContractSettlementItemOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'asc'
    const key = s(sortBy)
    if (!key) {
      return [{ createdAt: 'desc' }, { sortOrder: 'asc' }]
    }
    if (key === 'settlementCode') {
      return [{ settlement: { settlementCode: dir } }, { sortOrder: 'asc' }]
    }
    if (key === 'contractCode') {
      return [{ settlement: { contract: { contractCode: dir } } }, { sortOrder: 'asc' }]
    }
    if (key === 'customerName') {
      return [{ settlement: { customer: { name: dir } } }, { sortOrder: 'asc' }]
    }
    if (key === 'roomCode') {
      return [{ settlement: { room: { roomCode: dir } } }, { sortOrder: 'asc' }]
    }
    if (key === 'description') return [{ description: dir }]
    if (key === 'quantity') return [{ quantity: dir }]
    if (key === 'unitAmount') return [{ unitAmount: dir }]
    if (key === 'amount' || key === 'subtotal') return [{ amount: dir }]
    if (key === 'returnStatus') return [{ returnStatus: dir }]
    if (key === 'itemType') return [{ itemType: dir }]
    if (key === 'remark') return [{ remark: dir }]
    if (key === 'createdBy') {
      return [{ createdByUser: { displayName: dir } }, { createdByUser: { account: dir } }]
    }
    if (key === 'createdAt') return [{ createdAt: dir }]
    if (key === 'sortOrder') return [{ sortOrder: dir }, { createdAt: 'asc' }]
    return [{ createdAt: 'desc' }, { sortOrder: 'asc' }]
  }
}
