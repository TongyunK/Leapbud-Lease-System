import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  ContractSettlementCollectStatus,
  ContractSettlementItemType,
  ContractSettlementRefundStatus,
  ContractSettlementType,
  Prisma,
  ReceivableWriteoffDirection,
  RefundOrderStatus,
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  dateRangeFilter,
  paginateArgs,
  parsePage,
  parsePageSize,
  parseSortDir,
} from '../common/pagination'
import {
  numberFieldInOrEmpty,
  stringFieldInOrEmpty,
} from '../common/column-filter'
import { actorLabelsOrEmpty } from '../common/audit'
import { pushImportIssue, type ImportIssue } from '../common/import-result'
import {
  contractByRoomSelect,
  pickContractFromRoomCandidates,
} from '../common/resolve-contract-by-room'
import { ReceivableWriteoffsService } from './receivable-writeoffs.service'
import { RefundOrdersService, type RefundItemInput } from './refund-orders.service'
import { ContractChangeLogService } from './contract-change-log.service'
import {
  toContractSettlementDto,
  settlementInclude,
} from './contract-settlement.mapper'
import {
  CreateVacateSettlementDto,
  ImportVacateSettlementsDto,
  UpdateVacateSettlementDto,
  VacateDeductionItemDto,
} from './dto/vacate-conduct.dto'
import {
  dec,
  nextSettlementCode,
  round2,
} from './settlement-code.util'
import { BOOKING_OFFSET_EXCESS_REMARK } from './settlement-item.constants'
import {
  recalcSettlementCollectForReceivable,
  recalcSettlementCollectTotals,
} from './settlement-collect.sync'

type Db = Prisma.TransactionClient | PrismaService

export type SettlementItemInput = {
  itemType: ContractSettlementItemType
  description?: string
  amount: number
  quantity?: number
  unitAmount?: number
  returnStatus?: string
  sourceLoanItemId?: string | null
  receivableId?: string | null
  invoiceId?: string | null
  remark?: string
  /** 是否同步写 receivable_writeoff */
  writeWriteoff?: boolean
  writeoffReasonType?: string
}

export type VacateSettlementFields = {
  /** 退租类型：expiry / early */
  terminationKind?: string
  reason?: string
  noticeAttachment?: string
  doorKeyReturnedQty?: number
  smartCardReturnedQty?: number
  siteCondition?: string
  /** 旧退租编号（历史回填；新单通常为空） */
  legacyTerminationCode?: string
}

export type CreateSettlementInput = {
  type: ContractSettlementType
  contractId: string
  customerId: string
  roomId: string
  settlementDate: Date
  /** 退租业务日（VACATE 建议填写） */
  terminationDate?: Date | null
  /** 按金总额快照 */
  depositTotal?: number
  remark?: string
  /** 退租现场／类型等字段（仅 VACATE） */
  vacateFields?: VacateSettlementFields | null
  depositRefundId?: string | null
  items: SettlementItemInput[]
  actorId?: string | null
  /** 立即退款（可选） */
  immediateRefund?: {
    amount: number
    refundDate: Date
    paymentMethod?: string
    remark?: string
    depositRefundId?: string | null
    handlerId?: string | null
    items: RefundItemInput[]
  } | null
  /** 待退挂起：建 pending 退款单（可选） */
  pendingRefund?: {
    amount: number
    remark?: string
    depositRefundId?: string | null
    handlerId?: string | null
    items: RefundItemInput[]
  } | null
  changeLogSummary?: string
}

@Injectable()
export class ContractSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writeoffs: ReceivableWriteoffsService,
    private readonly refundOrders: RefundOrdersService,
    private readonly changeLogs: ContractChangeLogService,
  ) {}

  async findAll(params: {
    keyword?: string
    contractId?: string
    customerId?: string
    settlementCodes?: string[]
    types?: string[]
    statuses?: string[]
    refundStatuses?: string[]
    collectStatuses?: string[]
    contractCodes?: string[]
    customerNames?: string[]
    roomCodes?: string[]
    reasons?: string[]
    doorKeyReturnedQtys?: string[]
    smartCardReturnedQtys?: string[]
    itemCounts?: string[]
    writeoffCounts?: string[]
    refundOrderCounts?: string[]
    refundDueTotals?: string[]
    refundedTotals?: string[]
    refundRemainings?: string[]
    collectDueTotals?: string[]
    collectedTotals?: string[]
    collectRemainings?: string[]
    createdBys?: string[]
    sortBy?: string
    sortDir?: 'asc' | 'desc'
    settlementDateFrom?: string
    settlementDateTo?: string
    createdAtFrom?: string
    createdAtTo?: string
    /** @deprecated */
    type?: string
    /** @deprecated 等同 refundStatuses */
    status?: string
    page?: number
    pageSize?: number
  }) {
    const page = parsePage(params.page)
    const pageSize = parsePageSize(params.pageSize)
    const { skip, take } = paginateArgs(page, pageSize)
    const where = await this.buildListWhere(params)
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contractSettlement.count({ where }),
      this.prisma.contractSettlement.findMany({
        where,
        include: settlementInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        skip,
        take,
      }),
    ])
    return {
      items: rows.map((r) => toContractSettlementDto(r)),
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    }
  }

  private async buildListWhere(params: {
    keyword?: string
    contractId?: string
    customerId?: string
    settlementCodes?: string[]
    types?: string[]
    statuses?: string[]
    refundStatuses?: string[]
    collectStatuses?: string[]
    contractCodes?: string[]
    customerNames?: string[]
    roomCodes?: string[]
    reasons?: string[]
    doorKeyReturnedQtys?: string[]
    smartCardReturnedQtys?: string[]
    itemCounts?: string[]
    writeoffCounts?: string[]
    refundOrderCounts?: string[]
    refundDueTotals?: string[]
    refundedTotals?: string[]
    refundRemainings?: string[]
    collectDueTotals?: string[]
    collectedTotals?: string[]
    collectRemainings?: string[]
    createdBys?: string[]
    settlementDateFrom?: string
    settlementDateTo?: string
    createdAtFrom?: string
    createdAtTo?: string
    type?: string
    status?: string
  }): Promise<Prisma.ContractSettlementWhereInput> {
    const and: Prisma.ContractSettlementWhereInput[] = []
    if (params.contractId?.trim()) and.push({ contractId: params.contractId.trim() })
    if (params.customerId?.trim()) and.push({ customerId: params.customerId.trim() })

    const types = [
      ...(params.types || []),
      ...(params.type?.trim() ? [params.type.trim()] : []),
    ]
      .map((t) => String(t || '').trim().toUpperCase())
      .filter(Boolean)
    if (types.length) {
      const valid = types.filter((t) =>
        Object.values(ContractSettlementType).includes(t as ContractSettlementType),
      ) as ContractSettlementType[]
      if (valid.length === 1) and.push({ type: valid[0] })
      else if (valid.length > 1) and.push({ type: { in: valid } })
    }

    const refundStatuses = [
      ...(params.refundStatuses || []),
      ...(params.statuses || []),
      ...(params.status?.trim() ? [params.status.trim()] : []),
    ]
      .map((t) => String(t || '').trim())
      .filter(Boolean)
    if (refundStatuses.length) {
      const valid = refundStatuses.filter((t) =>
        Object.values(ContractSettlementRefundStatus).includes(
          t as ContractSettlementRefundStatus,
        ),
      ) as ContractSettlementRefundStatus[]
      if (valid.length === 1) and.push({ refundStatus: valid[0] })
      else if (valid.length > 1) and.push({ refundStatus: { in: valid } })
    }

    const collectStatuses = (params.collectStatuses || [])
      .map((t) => String(t || '').trim())
      .filter(Boolean)
    if (collectStatuses.length) {
      const valid = collectStatuses.filter((t) =>
        Object.values(ContractSettlementCollectStatus).includes(
          t as ContractSettlementCollectStatus,
        ),
      ) as ContractSettlementCollectStatus[]
      if (valid.length === 1) and.push({ collectStatus: valid[0] })
      else if (valid.length > 1) and.push({ collectStatus: { in: valid } })
    }

    const settlementCodeClause = stringFieldInOrEmpty(
      'settlementCode',
      params.settlementCodes,
    )
    if (settlementCodeClause) {
      and.push(settlementCodeClause as Prisma.ContractSettlementWhereInput)
    }

    const reasonClause = stringFieldInOrEmpty('reason', params.reasons, { nullable: true })
    if (reasonClause) and.push(reasonClause as Prisma.ContractSettlementWhereInput)

    const doorKeyClause = numberFieldInOrEmpty(
      'doorKeyReturnedQty',
      params.doorKeyReturnedQtys,
    )
    if (doorKeyClause) and.push(doorKeyClause as Prisma.ContractSettlementWhereInput)

    const smartCardClause = numberFieldInOrEmpty(
      'smartCardReturnedQty',
      params.smartCardReturnedQtys,
    )
    if (smartCardClause) {
      and.push(smartCardClause as Prisma.ContractSettlementWhereInput)
    }

    const refundDueClause = numberFieldInOrEmpty('refundDueTotal', params.refundDueTotals)
    if (refundDueClause) and.push(refundDueClause as Prisma.ContractSettlementWhereInput)

    const refundedClause = numberFieldInOrEmpty('refundedTotal', params.refundedTotals)
    if (refundedClause) and.push(refundedClause as Prisma.ContractSettlementWhereInput)

    const collectDueClause = numberFieldInOrEmpty('collectDueTotal', params.collectDueTotals)
    if (collectDueClause) and.push(collectDueClause as Prisma.ContractSettlementWhereInput)
    const collectedClause = numberFieldInOrEmpty('collectedTotal', params.collectedTotals)
    if (collectedClause) and.push(collectedClause as Prisma.ContractSettlementWhereInput)

    const remainingIds = await this.resolveRemainingFilterIds(params.refundRemainings)
    if (remainingIds) {
      if (!remainingIds.length) and.push({ id: '__none__' })
      else and.push({ id: { in: remainingIds } })
    }

    const collectRemainingIds = await this.resolveCollectRemainingFilterIds(
      params.collectRemainings,
    )
    if (collectRemainingIds) {
      if (!collectRemainingIds.length) and.push({ id: '__none__' })
      else and.push({ id: { in: collectRemainingIds } })
    }

    const contractCodeClause = stringFieldInOrEmpty('contractCode', params.contractCodes)
    if (contractCodeClause) {
      and.push({ contract: contractCodeClause as Prisma.ContractWhereInput })
    }
    const customerNameClause = stringFieldInOrEmpty('name', params.customerNames)
    if (customerNameClause) {
      and.push({ customer: customerNameClause as Prisma.CustomerWhereInput })
    }
    const roomCodeClause = stringFieldInOrEmpty('roomCode', params.roomCodes)
    if (roomCodeClause) {
      and.push({ room: roomCodeClause as Prisma.RoomWhereInput })
    }

    const createdByClause = actorLabelsOrEmpty('createdBy', params.createdBys)
    if (createdByClause) {
      and.push(createdByClause as Prisma.ContractSettlementWhereInput)
    }

    const settlementDate = dateRangeFilter(
      params.settlementDateFrom,
      params.settlementDateTo,
      false,
    )
    if (settlementDate) {
      and.push({
        OR: [{ settlementDate }, { terminationDate: settlementDate }],
      })
    }

    const createdAt = dateRangeFilter(params.createdAtFrom, params.createdAtTo, true)
    if (createdAt) and.push({ createdAt })

    const countIds = await this.resolveCountFilterIds(params)
    if (countIds) {
      if (!countIds.length) and.push({ id: '__none__' })
      else and.push({ id: { in: countIds } })
    }

    const kw = params.keyword?.trim()
    if (kw) {
      and.push({
        OR: [
          { settlementCode: { contains: kw, mode: 'insensitive' } },
          { legacyTerminationCode: { contains: kw, mode: 'insensitive' } },
          { reason: { contains: kw, mode: 'insensitive' } },
          { remark: { contains: kw, mode: 'insensitive' } },
          { contract: { contractCode: { contains: kw, mode: 'insensitive' } } },
          { customer: { name: { contains: kw, mode: 'insensitive' } } },
          { room: { roomCode: { contains: kw, mode: 'insensitive' } } },
          { createdByUser: { account: { contains: kw, mode: 'insensitive' } } },
          { createdByUser: { displayName: { contains: kw, mode: 'insensitive' } } },
        ],
      })
    }

    return and.length ? { AND: and } : {}
  }

  /** 待退金额筛选：应退 − 已退（四舍五入到分） */
  private async resolveRemainingFilterIds(
    refundRemainings?: string[],
  ): Promise<string[] | null> {
    const nums = (refundRemainings || [])
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .map((n) => Math.round(n * 100) / 100)
    if (!nums.length) return null
    const uniq = [...new Set(nums)]
    const matched = new Set<string>()
    for (const n of uniq) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM contract_settlements
         WHERE ROUND(
           (COALESCE(refund_due_total, 0) - COALESCE(refunded_total, 0))::numeric,
           2
         ) = $1::numeric`,
        n,
      )
      for (const r of rows) matched.add(r.id)
    }
    return [...matched]
  }

  /** 待收金额筛选：应补 − 已收 */
  private async resolveCollectRemainingFilterIds(
    collectRemainings?: string[],
  ): Promise<string[] | null> {
    const nums = (collectRemainings || [])
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .map((n) => Math.round(n * 100) / 100)
    if (!nums.length) return null
    const matched = new Set<string>()
    for (const n of [...new Set(nums)]) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM contract_settlements
         WHERE ROUND(
           (COALESCE(collect_due_total, 0) - COALESCE(collected_total, 0))::numeric,
           2
         ) = $1::numeric`,
        n,
      )
      for (const r of rows) matched.add(r.id)
    }
    return [...matched]
  }

  /** 明细／核销／退款单数量筛选：先聚合出匹配的结算 ID */
  private async resolveCountFilterIds(params: {
    itemCounts?: string[]
    writeoffCounts?: string[]
    refundOrderCounts?: string[]
  }): Promise<string[] | null> {
    const specs: Array<{
      raw?: string[]
      table: 'contract_settlement_items' | 'receivable_writeoffs' | 'refund_orders'
      fk: string
    }> = [
      { raw: params.itemCounts, table: 'contract_settlement_items', fk: 'settlement_id' },
      { raw: params.writeoffCounts, table: 'receivable_writeoffs', fk: 'settlement_id' },
      { raw: params.refundOrderCounts, table: 'refund_orders', fk: 'settlement_id' },
    ]
    let ids: Set<string> | null = null
    for (const spec of specs) {
      const nums = (spec.raw || [])
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n >= 0)
        .map((n) => Math.floor(n))
      if (!nums.length) continue
      const uniq = [...new Set(nums)]
      const matched = new Set<string>()
      for (const n of uniq) {
        if (n === 0) {
          const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT s.id FROM contract_settlements s
             WHERE NOT EXISTS (
               SELECT 1 FROM ${spec.table} t WHERE t.${spec.fk} = s.id
             )`,
          )
          for (const r of rows) matched.add(r.id)
        } else {
          const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT s.id FROM contract_settlements s
             WHERE (
               SELECT COUNT(*)::int FROM ${spec.table} t WHERE t.${spec.fk} = s.id
             ) = $1`,
            n,
          )
          for (const r of rows) matched.add(r.id)
        }
      }
      if (ids == null) ids = matched
      else {
        ids = new Set([...ids].filter((id) => matched.has(id)))
      }
    }
    return ids == null ? null : [...ids]
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.ContractSettlementOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'asc'
    const key = (sortBy || '').trim()
    if (!key) return [{ createdAt: 'desc' }]
    if (key === 'settlementCode') return [{ settlementCode: dir }]
    if (key === 'type') return [{ type: dir }]
    if (key === 'status' || key === 'refundStatus') return [{ refundStatus: dir }]
    if (key === 'collectStatus') return [{ collectStatus: dir }]
    if (key === 'contractCode') return [{ contract: { contractCode: dir } }]
    if (key === 'customerName') return [{ customer: { name: dir } }]
    if (key === 'roomCode') return [{ room: { roomCode: dir } }]
    if (key === 'reason') return [{ reason: dir }]
    if (key === 'doorKeyReturnedQty') return [{ doorKeyReturnedQty: dir }]
    if (key === 'smartCardReturnedQty') return [{ smartCardReturnedQty: dir }]
    if (key === 'refundDueTotal') return [{ refundDueTotal: dir }]
    if (key === 'refundedTotal') return [{ refundedTotal: dir }]
    // 待退金额 = 应退 − 已退；无独立列时用应退主序、已退反向近似排序
    if (key === 'refundRemaining') {
      return [{ refundDueTotal: dir }, { refundedTotal: dir === 'asc' ? 'desc' : 'asc' }]
    }
    if (key === 'collectDueTotal') return [{ collectDueTotal: dir }]
    if (key === 'collectedTotal') return [{ collectedTotal: dir }]
    if (key === 'collectRemaining') {
      return [{ collectDueTotal: dir }, { collectedTotal: dir === 'asc' ? 'desc' : 'asc' }]
    }
    if (key === 'settlementDate' || key === 'terminationDate') {
      return [{ terminationDate: dir }, { settlementDate: dir }]
    }
    if (key === 'itemCount') return [{ items: { _count: dir } }]
    if (key === 'writeoffCount') return [{ writeoffs: { _count: dir } }]
    if (key === 'refundOrderCount') return [{ refundOrders: { _count: dir } }]
    if (key === 'createdBy') {
      return [{ createdByUser: { displayName: dir } }, { createdByUser: { account: dir } }]
    }
    if (key === 'createdAt') return [{ createdAt: dir }]
    return [{ createdAt: 'desc' }]
  }

  async findOne(id: string) {
    const row = await this.prisma.contractSettlement.findUnique({
      where: { id },
      include: settlementInclude,
    })
    if (!row) throw new NotFoundException(`Settlement ${id} not found`)
    return toContractSettlementDto(row)
  }

  /**
   * 删除结算单：级联删除下属退款单及其出账流水、核销留痕；明细 Cascade。
   * 不回滚退租时已作废的发票／应收状态（超管清理用）。
   */
  async remove(id: string, _actor = '') {
    const existing = await this.prisma.contractSettlement.findUnique({
      where: { id },
      select: {
        id: true,
        refundOrders: { select: { id: true } },
      },
    })
    if (!existing) throw new NotFoundException(`Settlement ${id} not found`)

    const refundIds = existing.refundOrders.map((r) => r.id)

    await this.prisma.$transaction(async (tx) => {
      if (refundIds.length) {
        await tx.cashFlow.deleteMany({ where: { refundOrderId: { in: refundIds } } })
        await tx.refundOrder.deleteMany({ where: { id: { in: refundIds } } })
      }
      await tx.receivableWriteoff.deleteMany({ where: { settlementId: id } })
      await tx.contractSettlement.delete({ where: { id } })
    })

    return { success: true }
  }

  async findByContract(contractId: string) {
    const id = (contractId || '').trim()
    if (!id) throw new BadRequestException('contractId is required')
    const rows = await this.prisma.contractSettlement.findMany({
      where: { contractId: id },
      include: settlementInclude,
      orderBy: [{ settlementDate: 'desc' }, { createdAt: 'desc' }],
    })
    return rows.map((r) => toContractSettlementDto(r))
  }

  async create(input: CreateSettlementInput, db?: Db) {
    const client = db ?? this.prisma
    const actorId = input.actorId || null
    const settlementCode = await nextSettlementCode(client)

    let deductionTotal = 0
    let waiverTotal = 0
    let additionalTotal = 0
    let refundDueTotal = 0
    let collectDueTotal = 0

    for (const it of input.items || []) {
      const amt = round2(Math.max(0, Number(it.amount) || 0))
      if (amt <= 0.009) continue
      switch (it.itemType) {
        case ContractSettlementItemType.DAMAGE_DEDUCTION:
        case ContractSettlementItemType.PENALTY_DEDUCTION:
          // 历史误记：定金抵超额曾用 PENALTY + booking_offset_excess；不计入按金扣除
          if ((it.remark || '').trim() === BOOKING_OFFSET_EXCESS_REMARK) break
          deductionTotal = round2(deductionTotal + amt)
          break
        case ContractSettlementItemType.BOOKING_DEPOSIT_OFFSET:
          // 定金抵扣（超出按金赔偿等）：属抵扣，不计入按金扣除合计
          break
        case ContractSettlementItemType.WAIVER:
          waiverTotal = round2(waiverTotal + amt)
          break
        case ContractSettlementItemType.ADDITIONAL_CHARGE:
          additionalTotal = round2(additionalTotal + amt)
          collectDueTotal = round2(collectDueTotal + amt)
          break
        case ContractSettlementItemType.REFUND_ALLOCATION:
          refundDueTotal = round2(refundDueTotal + amt)
          break
        case ContractSettlementItemType.VOID_RECEIVABLE:
          // 作废不计金额汇总到扣/退；仍落明细
          break
        default:
          break
      }
    }

    let refundedTotal = 0
    if (input.immediateRefund && round2(input.immediateRefund.amount) > 0.009) {
      refundedTotal = round2(input.immediateRefund.amount)
    }

    const pendingAmt = round2(input.pendingRefund?.amount ?? 0)
    const remainingRefundDue = round2(
      Math.max(0, refundDueTotal - refundedTotal),
    )
    let refundStatus: ContractSettlementRefundStatus =
      ContractSettlementRefundStatus.settled
    if (remainingRefundDue > 0.009 || pendingAmt > 0.009) {
      refundStatus =
        refundedTotal > 0.009
          ? ContractSettlementRefundStatus.partial
          : ContractSettlementRefundStatus.pending_refund
    }
    const collectStatus: ContractSettlementCollectStatus =
      collectDueTotal > 0.009
        ? ContractSettlementCollectStatus.pending_collect
        : ContractSettlementCollectStatus.none

    const vf = input.vacateFields || null
    const settlement = await client.contractSettlement.create({
      data: {
        settlementCode,
        type: input.type,
        refundStatus,
        collectStatus,
        contractId: input.contractId,
        customerId: input.customerId,
        roomId: input.roomId,
        settlementDate: input.settlementDate,
        terminationDate: input.terminationDate ?? null,
        depositTotal: dec(round2(Math.max(0, Number(input.depositTotal) || 0))),
        deductionTotal: dec(deductionTotal),
        waiverTotal: dec(waiverTotal),
        additionalTotal: dec(additionalTotal),
        refundDueTotal: dec(refundDueTotal),
        refundedTotal: dec(refundedTotal),
        collectDueTotal: dec(collectDueTotal),
        collectedTotal: dec(0),
        depositRefundId: input.depositRefundId || null,
        terminationKind: (vf?.terminationKind || '').trim(),
        reason: (vf?.reason || '').trim(),
        noticeAttachment: (vf?.noticeAttachment || '').trim(),
        doorKeyReturnedQty: Math.max(0, Math.floor(Number(vf?.doorKeyReturnedQty) || 0)),
        smartCardReturnedQty: Math.max(
          0,
          Math.floor(Number(vf?.smartCardReturnedQty) || 0),
        ),
        siteCondition: (vf?.siteCondition || '').trim(),
        legacyTerminationCode: (vf?.legacyTerminationCode || '').trim(),
        remark: (input.remark || '').trim(),
        createdById: actorId,
        updatedById: actorId,
      },
    })

    const createdItems: Array<{
      id: string
      itemType: ContractSettlementItemType
      amount: number
      receivableId: string | null
    }> = []

    let sort = 0
    for (const it of input.items || []) {
      const amt = round2(Math.max(0, Number(it.amount) || 0))
      if (amt <= 0.009 && it.itemType !== ContractSettlementItemType.VOID_RECEIVABLE) {
        continue
      }
      const quantity =
        it.quantity != null && !Number.isNaN(Number(it.quantity))
          ? round2(Math.max(0, Number(it.quantity)))
          : 0
      const unitAmount =
        it.unitAmount != null && !Number.isNaN(Number(it.unitAmount))
          ? round2(Math.max(0, Number(it.unitAmount)))
          : 0
      const row = await client.contractSettlementItem.create({
        data: {
          settlementId: settlement.id,
          itemType: it.itemType,
          description: (it.description || '').trim(),
          amount: dec(amt),
          quantity: dec(quantity),
          unitAmount: dec(unitAmount),
          returnStatus: (it.returnStatus || '').trim(),
          sourceLoanItemId: it.sourceLoanItemId || null,
          receivableId: it.receivableId || null,
          invoiceId: it.invoiceId || null,
          sortOrder: sort++,
          remark: (it.remark || '').trim(),
          createdById: actorId,
          updatedById: actorId,
        },
      })
      createdItems.push({
        id: row.id,
        itemType: row.itemType,
        amount: amt,
        receivableId: row.receivableId,
      })

      const shouldWrite =
        it.writeWriteoff === true ||
        it.itemType === ContractSettlementItemType.VOID_RECEIVABLE ||
        it.itemType === ContractSettlementItemType.WAIVER ||
        it.itemType === ContractSettlementItemType.DAMAGE_DEDUCTION ||
        it.itemType === ContractSettlementItemType.PENALTY_DEDUCTION

      if (shouldWrite && it.receivableId && amt > 0.009) {
        await this.writeoffs.create(
          {
            receivableId: it.receivableId,
            amount: amt,
            direction: ReceivableWriteoffDirection.reduce,
            reasonType:
              it.writeoffReasonType ||
              (it.itemType === ContractSettlementItemType.VOID_RECEIVABLE
                ? 'void_cancel'
                : it.itemType === ContractSettlementItemType.WAIVER
                  ? 'waiver'
                  : 'settlement_deduction'),
            writeoffDate: input.settlementDate,
            settlementId: settlement.id,
            settlementItemId: row.id,
            remark: it.description || it.remark,
            actorId,
          },
          client,
        )
      }
    }

    let refundOrderId: string | null = null
    let refundOrderCode = ''
    let pendingRefundOrderId: string | null = null
    let pendingRefundOrderCode = ''

    // 一份结算一张退款单：应退=此刻退+待退；此刻退作为首笔流水
    const immediateAmt = round2(input.immediateRefund?.amount ?? 0)
    const pendingAmtCreate = round2(input.pendingRefund?.amount ?? 0)
    const orderDue = round2(immediateAmt + pendingAmtCreate)
    if (orderDue > 0.009) {
      const mergedItems = [
        ...(input.immediateRefund?.items || []),
        ...(input.pendingRefund?.items || []),
      ]
      const order = await this.refundOrders.create(
        {
          contractId: input.contractId,
          customerId: input.customerId,
          roomId: input.roomId,
          settlementId: settlement.id,
          depositRefundId:
            input.immediateRefund?.depositRefundId ??
            input.pendingRefund?.depositRefundId ??
            input.depositRefundId ??
            null,
          amount: orderDue,
          initialPaidAmount: immediateAmt > 0.009 ? immediateAmt : 0,
          refundDate:
            immediateAmt > 0.009
              ? input.immediateRefund?.refundDate ?? input.settlementDate
              : null,
          paymentMethod: input.immediateRefund?.paymentMethod,
          handlerId:
            input.immediateRefund?.handlerId ??
            input.pendingRefund?.handlerId ??
            (immediateAmt > 0.009 ? actorId : null),
          remark:
            [input.immediateRefund?.remark, input.pendingRefund?.remark]
              .filter(Boolean)
              .join('\n') || undefined,
          items: mergedItems.length
            ? mergedItems
            : [{ itemType: 'room_deposit', description: '退还按金', amount: orderDue }],
          actorId,
        },
        client,
      )
      refundOrderId = order.id
      refundOrderCode = order.refundCode
      if (order.status === RefundOrderStatus.pending || String(order.status) === 'partial') {
        pendingRefundOrderId = order.id
        pendingRefundOrderCode = order.refundCode
      }
    }

    if (input.changeLogSummary) {
      await this.changeLogs.append(
        {
          contractId: input.contractId,
          changeType: input.type === ContractSettlementType.CANCEL ? 'cancel' : 'vacate',
          fieldPath: 'status',
          after: { settlementId: settlement.id, settlementCode },
          refType: 'settlement',
          refId: settlement.id,
          summary: input.changeLogSummary,
          actorId,
        },
        client,
      )
    }

    const totals = await this.recalcRefundTotals(settlement.id, actorId, client)
    const collectTotals = await this.recalcCollectTotals(settlement.id, actorId, client)

    return {
      settlementId: settlement.id,
      settlementCode,
      status: totals?.refundStatus ?? refundStatus,
      refundStatus: totals?.refundStatus ?? refundStatus,
      collectStatus: collectTotals?.collectStatus ?? collectStatus,
      refundOrderId,
      refundOrderCode,
      pendingRefundOrderId,
      pendingRefundOrderCode,
      items: createdItems,
      deductionTotal,
      waiverTotal,
      additionalTotal,
      refundDueTotal: totals?.refundDueTotal ?? refundDueTotal,
      refundedTotal: totals?.refundedTotal ?? refundedTotal,
      collectDueTotal: collectTotals?.collectDueTotal ?? collectDueTotal,
      collectedTotal: collectTotals?.collectedTotal ?? 0,
    }
  }

  /**
   * 按关联退款单重算已退合计与应退状态：
   * refundedTotal = 各未取消单 paidAmount 合计；
   * 未退齐且已退&gt;0 → partial；未退齐且已退=0 → pending_refund；否则 settled。
   */
  async recalcRefundTotals(
    settlementId: string,
    actorId?: string | null,
    db?: Db,
  ) {
    const client = db ?? this.prisma
    const row = await client.contractSettlement.findUnique({
      where: { id: settlementId },
      select: {
        id: true,
        refundDueTotal: true,
        refundStatus: true,
      },
    })
    if (!row) return null

    const orders = await client.$queryRaw<
      Array<{ status: string; amount: Prisma.Decimal; paid_amount: Prisma.Decimal }>
    >`
      SELECT status::text AS status, amount, paid_amount
      FROM refund_orders
      WHERE settlement_id = ${settlementId}
        AND status <> CAST('cancelled' AS "RefundOrderStatus")
    `

    let refundedTotal = 0
    let openRemaining = 0
    for (const o of orders) {
      const paid = round2(Number(o.paid_amount?.toString?.() ?? 0))
      const due = round2(Number(o.amount.toString()))
      refundedTotal = round2(refundedTotal + paid)
      if (o.status === 'pending' || o.status === 'partial' || paid + 0.009 < due) {
        openRemaining = round2(openRemaining + Math.max(0, due - paid))
      }
    }

    const refundDue = round2(Number(row.refundDueTotal.toString()))
    let nextStatus: ContractSettlementRefundStatus =
      ContractSettlementRefundStatus.settled
    if (refundDue > 0.009 && (openRemaining > 0.009 || refundedTotal + 0.009 < refundDue)) {
      nextStatus =
        refundedTotal > 0.009
          ? ContractSettlementRefundStatus.partial
          : ContractSettlementRefundStatus.pending_refund
    }

    const updated = await client.contractSettlement.update({
      where: { id: settlementId },
      data: {
        refundedTotal: dec(refundedTotal),
        refundStatus: nextStatus,
        updatedById: actorId || null,
      },
    })

    return {
      settlementId: updated.id,
      refundStatus: updated.refundStatus,
      /** @deprecated */
      status: updated.refundStatus,
      refundDueTotal: refundDue,
      refundedTotal,
      pendingTotal: openRemaining,
      remaining: round2(Math.max(0, refundDue - refundedTotal)),
    }
  }

  /** 按 ADDITIONAL_CHARGE 关联应收回写已收与应收状态 */
  async recalcCollectTotals(
    settlementId: string,
    actorId?: string | null,
    db?: Db,
  ) {
    return recalcSettlementCollectTotals(db ?? this.prisma, settlementId, actorId)
  }

  /** 应收收款后：若挂在结算 ADDITIONAL_CHARGE，则回写该结算应收进度 */
  async recalcCollectTotalsForReceivable(
    receivableId: string,
    actorId?: string | null,
    db?: Db,
  ) {
    return recalcSettlementCollectForReceivable(
      db ?? this.prisma,
      receivableId,
      actorId,
    )
  }

  /** 按已付退款增量刷新（兼容旧调用）；优先用 recalcRefundTotals */
  async refreshAfterRefund(
    settlementId: string,
    _paidAmount: number,
    actorId?: string | null,
    db?: Db,
  ) {
    return this.recalcRefundTotals(settlementId, actorId, db)
  }

  async findLatestByContractAndType(
    contractId: string,
    type: ContractSettlementType,
    db?: Db,
  ) {
    const client = db ?? this.prisma
    return client.contractSettlement.findFirst({
      where: { contractId, type },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** 手工新增 VACATE 结算（现场字段；不走一键退租） */
  private mapVacateDeductionItems(
    rows: VacateDeductionItemDto[] | undefined,
  ): SettlementItemInput[] {
    if (!rows?.length) return []
    const sorted = [...rows].sort(
      (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0),
    )
    const out: SettlementItemInput[] = []
    for (const row of sorted) {
      const description = (row.description || '').trim()
      if (!description) continue
      const quantity = Math.max(0, Number(row.quantity) || 0)
      const unitAmount = Math.max(0, Number(row.unitAmount) || 0)
      const amount =
        row.amount != null && !Number.isNaN(Number(row.amount))
          ? round2(Math.max(0, Number(row.amount)))
          : round2(quantity * unitAmount)
      if (amount <= 0.009) continue
      const returnStatus = (row.returnStatus || '').trim()
      const itemType =
        returnStatus === 'damaged'
          ? ContractSettlementItemType.DAMAGE_DEDUCTION
          : ContractSettlementItemType.PENALTY_DEDUCTION
      out.push({
        itemType,
        description,
        amount,
        quantity,
        unitAmount: quantity > 0 ? round2(amount / quantity) : unitAmount,
        returnStatus:
          returnStatus === 'damaged' || returnStatus === 'missing' ? returnStatus : '',
        sourceLoanItemId: (row.sourceLoanItemId || '').trim() || null,
        remark: (row.remark || '').trim(),
      })
    }
    return out
  }

  /** 全量替换结算上的 DAMAGE／PENALTY 扣款行，并重算 deductionTotal */
  private async replaceVacateDeductionItems(
    settlementId: string,
    rows: VacateDeductionItemDto[],
    actorId: string | null,
    db?: Db,
  ) {
    const client = db ?? this.prisma
    const mapped = this.mapVacateDeductionItems(rows)
    // 仅替换真正的按金扣除行；保留定金抵扣（BOOKING_DEPOSIT_OFFSET／历史 remark）
    await client.contractSettlementItem.deleteMany({
      where: {
        settlementId,
        itemType: {
          in: [
            ContractSettlementItemType.DAMAGE_DEDUCTION,
            ContractSettlementItemType.PENALTY_DEDUCTION,
          ],
        },
        NOT: { remark: BOOKING_OFFSET_EXCESS_REMARK },
      },
    })
    let deductionTotal = 0
    let sort = 0
    for (const it of mapped) {
      const amt = round2(Math.max(0, Number(it.amount) || 0))
      const remark = (it.remark || '').trim()
      if (remark === BOOKING_OFFSET_EXCESS_REMARK) continue
      await client.contractSettlementItem.create({
        data: {
          settlementId,
          itemType: it.itemType,
          description: (it.description || '').trim(),
          amount: dec(amt),
          quantity: dec(round2(Math.max(0, Number(it.quantity) || 0))),
          unitAmount: dec(round2(Math.max(0, Number(it.unitAmount) || 0))),
          returnStatus: (it.returnStatus || '').trim(),
          sourceLoanItemId: it.sourceLoanItemId || null,
          sortOrder: sort++,
          remark,
          createdById: actorId,
          updatedById: actorId,
        },
      })
      deductionTotal = round2(deductionTotal + amt)
    }
    await client.contractSettlement.update({
      where: { id: settlementId },
      data: {
        deductionTotal: dec(deductionTotal),
        updatedById: actorId,
      },
    })
  }

  async createVacate(dto: CreateVacateSettlementDto, actor = '') {
    const contract = await this.resolveContractForVacate(dto.contractId, dto.contractCode)
    const { customerId, roomId } = await this.resolveCustomerRoom(
      contract,
      dto.customerId,
      dto.roomId,
    )
    const terminationDate =
      this.parseDateOnly(dto.terminationDate, 'terminationDate') || new Date()
    const depositTotal = await this.contractDepositTotal(contract.id)
    const actorId = actor || null
    const deductionItems = this.mapVacateDeductionItems(dto.deductionItems)

    const meta = await this.create({
      type: ContractSettlementType.VACATE,
      contractId: contract.id,
      customerId,
      roomId,
      settlementDate: terminationDate,
      terminationDate,
      depositTotal,
      remark: (dto.remark || '').trim(),
      vacateFields: {
        terminationKind: (dto.terminationKind || '').trim(),
        reason: (dto.reason || '').trim(),
        noticeAttachment: (dto.noticeAttachment || '').trim(),
        doorKeyReturnedQty: Math.max(0, Math.floor(Number(dto.doorKeyReturnedQty) || 0)),
        smartCardReturnedQty: Math.max(
          0,
          Math.floor(Number(dto.smartCardReturnedQty) || 0),
        ),
        siteCondition: (dto.siteCondition || '').trim(),
        legacyTerminationCode: (dto.legacyTerminationCode || '').trim(),
      },
      items: deductionItems,
      actorId,
      changeLogSummary: '手工新增退租结算',
    })

    return this.findOne(meta.settlementId)
  }

  async updateVacate(id: string, dto: UpdateVacateSettlementDto, actor = '') {
    const existing = await this.prisma.contractSettlement.findUnique({
      where: { id },
      select: { id: true, type: true },
    })
    if (!existing) throw new NotFoundException(`Settlement ${id} not found`)
    if (existing.type !== ContractSettlementType.VACATE) {
      throw new BadRequestException('Only VACATE settlements can be updated via this API')
    }

    const actorId = actor || null
    const data: Prisma.ContractSettlementUncheckedUpdateInput = {}
    if (actorId) data.updatedById = actorId
    if (dto.terminationDate !== undefined) {
      const d = this.parseDateOnly(dto.terminationDate, 'terminationDate')
      data.terminationDate = d
      if (d) data.settlementDate = d
    }
    if (dto.terminationKind !== undefined) {
      data.terminationKind = (dto.terminationKind || '').trim()
    }
    if (dto.reason !== undefined) data.reason = (dto.reason || '').trim()
    if (dto.noticeAttachment !== undefined) {
      data.noticeAttachment = (dto.noticeAttachment || '').trim()
    }
    if (dto.doorKeyReturnedQty !== undefined) {
      data.doorKeyReturnedQty = Math.max(
        0,
        Math.floor(Number(dto.doorKeyReturnedQty) || 0),
      )
    }
    if (dto.smartCardReturnedQty !== undefined) {
      data.smartCardReturnedQty = Math.max(
        0,
        Math.floor(Number(dto.smartCardReturnedQty) || 0),
      )
    }
    if (dto.siteCondition !== undefined) {
      data.siteCondition = (dto.siteCondition || '').trim()
    }
    if (dto.legacyTerminationCode !== undefined) {
      data.legacyTerminationCode = (dto.legacyTerminationCode || '').trim()
    }
    if (dto.remark !== undefined) data.remark = (dto.remark || '').trim()

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.contractSettlement.update({ where: { id }, data })
      }
      if (dto.deductionItems !== undefined) {
        await this.replaceVacateDeductionItems(id, dto.deductionItems || [], actorId, tx)
      }
    })
    return this.findOne(id)
  }

  /** 批量导入 VACATE 结算（现场字段 + 合约按金快照） */
  async importVacateBatch(dto: ImportVacateSettlementsDto, actor = '') {
    const items = dto.items || []
    let created = 0
    let skipped = 0
    let failed = 0
    let unlinked = 0
    const issues: ImportIssue[] = []
    const actorId = actor || null

    const contractCodes = [
      ...new Set(items.map((it) => (it.contractCode || '').trim()).filter(Boolean)),
    ]
    const roomCodes = [
      ...new Set(items.map((it) => (it.roomCode || '').trim()).filter(Boolean)),
    ]

    const contracts = contractCodes.length
      ? await this.prisma.contract.findMany({
          where: { contractCode: { in: contractCodes } },
          select: {
            id: true,
            contractCode: true,
            customerId: true,
            roomId: true,
            roomDeposit: true,
            miscDeposit: true,
            doorKeyDeposit: true,
            mailboxKeyDeposit: true,
          },
        })
      : []
    const contractByCode = new Map(
      contracts.map((c) => [c.contractCode.toLowerCase(), c]),
    )

    const rooms = roomCodes.length
      ? await this.prisma.room.findMany({
          where: { roomCode: { in: roomCodes } },
          select: { id: true, roomCode: true },
        })
      : []
    const roomByCode = new Map(rooms.map((r) => [r.roomCode.toLowerCase(), r]))
    const roomIds = rooms.map((r) => r.id)
    const contractsByRoom = roomIds.length
      ? await this.prisma.contract.findMany({
          where: { roomId: { in: roomIds } },
          select: contractByRoomSelect,
        })
      : []
    const contractsForRoom = new Map<string, typeof contractsByRoom>()
    for (const c of contractsByRoom) {
      const list = contractsForRoom.get(c.roomId) || []
      list.push(c)
      contractsForRoom.set(c.roomId, list)
    }

    for (const item of items) {
      const contractId = (item.contractId || '').trim()
      const contractCode = (item.contractCode || '').trim()
      const roomCode = (item.roomCode || '').trim()
      const customerName = (item.customerName || '').trim()
      const legacyCode = (item.legacyTerminationCode || '').trim()
      const keys = {
        旧退租编号: legacyCode,
        合約編號: contractCode,
        房間編號: roomCode,
        客戶名稱: customerName,
      }

      if (!contractCode && !contractId && !roomCode) {
        skipped += 1
        pushImportIssue(issues, 'skipped', '缺少合約編號、合約 ID 或房間編號', keys)
        continue
      }

      let contract: {
        id: string
        contractCode: string
        customerId: string
        roomId: string
        roomDeposit?: Prisma.Decimal | null
        miscDeposit?: Prisma.Decimal | null
        doorKeyDeposit?: Prisma.Decimal | null
        mailboxKeyDeposit?: Prisma.Decimal | null
      } | null = null

      if (contractId) {
        contract = await this.prisma.contract.findUnique({
          where: { id: contractId },
          select: {
            id: true,
            contractCode: true,
            customerId: true,
            roomId: true,
            roomDeposit: true,
            miscDeposit: true,
            doorKeyDeposit: true,
            mailboxKeyDeposit: true,
          },
        })
      } else if (contractCode) {
        contract = contractByCode.get(contractCode.toLowerCase()) || null
      } else if (roomCode) {
        const room = roomByCode.get(roomCode.toLowerCase())
        if (!room) {
          unlinked += 1
          pushImportIssue(issues, 'unlinked', `房間「${roomCode}」未找到`, keys)
          continue
        }
        const picked = pickContractFromRoomCandidates(
          contractsForRoom.get(room.id) || [],
          customerName || undefined,
        )
        if (!picked) {
          unlinked += 1
          pushImportIssue(
            issues,
            'unlinked',
            customerName
              ? `房間「${roomCode}」下無法唯一匹配客戶「${customerName}」的合約`
              : `房間「${roomCode}」下無有效合約或合約不唯一`,
            keys,
          )
          continue
        }
        contract = {
          id: picked.id,
          contractCode: picked.contractCode,
          customerId: picked.customerId,
          roomId: picked.roomId,
        }
      }

      if (!contract) {
        unlinked += 1
        pushImportIssue(
          issues,
          'unlinked',
          contractCode
            ? `合約編號「${contractCode}」未找到`
            : contractId
              ? `合約 ID「${contractId}」未找到`
              : '無法解析關聯合約',
          keys,
        )
        continue
      }

      try {
        const { customerId, roomId } = await this.resolveCustomerRoom(
          contract,
          item.customerId,
          item.roomId,
        )
        const terminationDate =
          this.parseDateOnly(item.terminationDate, 'terminationDate') || new Date()
        const depositTotal = round2(
          Number(contract.roomDeposit?.toString() ?? 0) +
            Number(contract.miscDeposit?.toString() ?? 0) +
            Number(contract.doorKeyDeposit?.toString() ?? 0) +
            Number(contract.mailboxKeyDeposit?.toString() ?? 0),
        )
        await this.create({
          type: ContractSettlementType.VACATE,
          contractId: contract.id,
          customerId,
          roomId,
          settlementDate: terminationDate,
          terminationDate,
          depositTotal,
          remark: (item.remark || '').trim(),
          vacateFields: {
            terminationKind: (item.terminationKind || '').trim(),
            reason: (item.reason || '').trim(),
            noticeAttachment: (item.noticeAttachment || '').trim(),
            doorKeyReturnedQty: Math.max(
              0,
              Math.floor(Number(item.doorKeyReturnedQty) || 0),
            ),
            smartCardReturnedQty: Math.max(
              0,
              Math.floor(Number(item.smartCardReturnedQty) || 0),
            ),
            siteCondition: (item.siteCondition || '').trim(),
            legacyTerminationCode: legacyCode,
          },
          items: [],
          actorId,
        })
        created += 1
      } catch (e) {
        failed += 1
        const msg = e instanceof Error ? e.message : '建立退租结算失败'
        pushImportIssue(issues, 'failed', msg, {
          ...keys,
          合約編號: contract.contractCode,
        })
      }
    }

    return { created, updated: 0, skipped, failed, unlinked, issues }
  }

  private parseDateOnly(v: string | null | undefined, field: string): Date | null {
    const raw = (v ?? '').trim()
    if (!raw) return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new BadRequestException(`${field} must be YYYY-MM-DD`)
    }
    return new Date(`${raw}T00:00:00.000Z`)
  }

  private async resolveContractForVacate(
    contractId?: string | null,
    contractCode?: string | null,
  ) {
    const id = (contractId || '').trim()
    const code = (contractCode || '').trim()
    if (id) {
      const row = await this.prisma.contract.findUnique({
        where: { id },
        select: { id: true, contractCode: true, customerId: true, roomId: true },
      })
      if (!row) throw new BadRequestException('Invalid contractId')
      return row
    }
    if (code) {
      const row = await this.prisma.contract.findUnique({
        where: { contractCode: code },
        select: { id: true, contractCode: true, customerId: true, roomId: true },
      })
      if (!row) throw new BadRequestException('Invalid contractCode')
      return row
    }
    throw new BadRequestException('contractId or contractCode is required')
  }

  private async resolveCustomerRoom(
    contract: { customerId: string; roomId: string },
    dtoCustomerId?: string | null,
    dtoRoomId?: string | null,
  ) {
    let customerId = (dtoCustomerId || '').trim()
    let roomId = (dtoRoomId || '').trim()
    if (!customerId) customerId = contract.customerId
    if (!roomId) roomId = contract.roomId

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    })
    if (!customer) throw new BadRequestException('Invalid customerId')

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true },
    })
    if (!room) throw new BadRequestException('Invalid roomId')

    return { customerId, roomId }
  }

  private async contractDepositTotal(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        roomDeposit: true,
        miscDeposit: true,
        doorKeyDeposit: true,
        mailboxKeyDeposit: true,
      },
    })
    if (!contract) return 0
    const loanSum = await this.prisma.contractLoanItem.aggregate({
      where: { contractId },
      _sum: { subtotal: true },
    })
    return round2(
      Number(contract.roomDeposit?.toString() ?? 0) +
        Number(contract.miscDeposit?.toString() ?? 0) +
        Number(contract.doorKeyDeposit?.toString() ?? 0) +
        Number(contract.mailboxKeyDeposit?.toString() ?? 0) +
        Number(loanSum._sum?.subtotal?.toString() ?? 0),
    )
  }
}
