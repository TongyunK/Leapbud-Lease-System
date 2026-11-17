import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common'
import { CashFlowDirection, CashFlowSourceType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  dateRangeFilter,
  paginateArgs,
  parsePage,
  parsePageSize,
  parseSortDir,
} from '../common/pagination'
import { actorLabelsOrEmpty, auditActorLabel, auditUserInclude } from '../common/audit'
import { runBatchRemove } from '../common/batch-delete'
import {
  numberFieldInOrEmpty,
  splitEmptyFilter,
  stringFieldInOrEmpty,
} from '../common/column-filter'
import { pushImportIssue, type ImportIssue } from '../common/import-result'
import { CashFlowsService } from './cash-flows.service'
import { RefundOrdersService } from './refund-orders.service'
import { ContractSettlementsService } from './contract-settlements.service'
import { round2 } from './settlement-code.util'

function s(v?: string | null) {
  return (v || '').trim()
}

function parseYmd(v?: string | null): Date | null {
  const raw = s(v)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  return new Date(`${raw}T00:00:00.000Z`)
}

function dateOnly(d: Date | null | undefined): string {
  if (!d) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function num(v: Prisma.Decimal | number | null | undefined) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  return Number(v.toString())
}

const include = {
  contract: { select: { id: true, contractCode: true } },
  customer: { select: { id: true, customerCode: true, name: true } },
  receipt: { select: { id: true, receiptCode: true } },
  refundOrder: { select: { id: true, refundCode: true } },
  ...auditUserInclude,
} satisfies Prisma.CashFlowInclude

@Injectable()
export class CashFlowsQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashFlows: CashFlowsService,
    private readonly refundOrders: RefundOrdersService,
    @Inject(forwardRef(() => ContractSettlementsService))
    private readonly settlements: ContractSettlementsService,
  ) {}

  private toDto(row: any) {
    return {
      id: row.id,
      flowCode: row.flowCode,
      direction: row.direction,
      amount: num(row.amount),
      flowDate: dateOnly(row.flowDate),
      paymentMethod: row.paymentMethod ?? '',
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      contractId: row.contractId,
      contractCode: row.contract?.contractCode ?? '',
      customerId: row.customerId,
      customerCode: row.customer?.customerCode ?? '',
      customerName: row.customer?.name ?? '',
      receiptId: row.receiptId,
      receiptCode: row.receipt?.receiptCode ?? '',
      refundOrderId: row.refundOrderId,
      refundOrderCode: row.refundOrder?.refundCode ?? '',
      receiptCount: row.receiptId ? 1 : 0,
      refundOrderCount: row.refundOrderId ? 1 : 0,
      remark: row.remark ?? '',
      createdBy: auditActorLabel(row.createdByUser),
      updatedBy: auditActorLabel(row.updatedByUser),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.CashFlowOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'asc'
    const key = (sortBy || '').trim()
    if (!key) return [{ flowDate: 'desc' }, { createdAt: 'desc' }]
    if (key === 'flowCode') return [{ flowCode: dir }]
    if (key === 'direction') return [{ direction: dir }]
    if (key === 'amount') return [{ amount: dir }]
    if (key === 'flowDate') return [{ flowDate: dir }, { createdAt: dir }]
    if (key === 'sourceType') return [{ sourceType: dir }]
    if (key === 'sourceRef') {
      return [
        { receipt: { receiptCode: dir } },
        { refundOrder: { refundCode: dir } },
      ]
    }
    // 0/1 计数：按关联外键是否为空近似排序
    if (key === 'receiptCount') return [{ receiptId: dir }]
    if (key === 'refundOrderCount') return [{ refundOrderId: dir }]
    if (key === 'contractCode') return [{ contract: { contractCode: dir } }]
    if (key === 'customerName') return [{ customer: { name: dir } }]
    if (key === 'createdBy') {
      return [{ createdByUser: { displayName: dir } }, { createdByUser: { account: dir } }]
    }
    if (key === 'createdAt') return [{ createdAt: dir }]
    return [{ flowDate: 'desc' }, { createdAt: 'desc' }]
  }

  /** 来源编号：收据号或退款单号 */
  private sourceRefWhere(raw?: string[]): Prisma.CashFlowWhereInput | null {
    const { values, includeEmpty } = splitEmptyFilter(raw)
    if (!values.length && !includeEmpty) return null
    const or: Prisma.CashFlowWhereInput[] = []
    if (values.length === 1) {
      or.push(
        { receipt: { receiptCode: values[0] } },
        { refundOrder: { refundCode: values[0] } },
      )
    } else if (values.length > 1) {
      or.push(
        { receipt: { receiptCode: { in: values } } },
        { refundOrder: { refundCode: { in: values } } },
      )
    }
    if (includeEmpty) {
      or.push({ AND: [{ receiptId: null }, { refundOrderId: null }] })
    }
    return or.length === 1 ? or[0]! : { OR: or }
  }

  /** 收据／退款关联计数（0 或 1） */
  private linkCountWhere(
    field: 'receiptId' | 'refundOrderId',
    raw?: string[],
  ): Prisma.CashFlowWhereInput | null {
    const nums = (raw || [])
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .map((n) => Math.floor(n))
    if (!nums.length) return null
    const uniq = [...new Set(nums)]
    const or: Prisma.CashFlowWhereInput[] = []
    for (const n of uniq) {
      if (n === 0) or.push({ [field]: null })
      else if (n >= 1) or.push({ [field]: { not: null } })
    }
    if (!or.length) return null
    return or.length === 1 ? or[0]! : { OR: or }
  }

  async findAll(params: {
    keyword?: string
    contractId?: string
    customerId?: string
    receiptId?: string
    refundOrderId?: string
    invoiceId?: string
    receivableId?: string
    direction?: string
    sourceType?: string
    flowCodes?: string[]
    directions?: string[]
    sourceTypes?: string[]
    sourceRefs?: string[]
    contractCodes?: string[]
    customerNames?: string[]
    amounts?: string[]
    receiptCounts?: string[]
    refundOrderCounts?: string[]
    createdBys?: string[]
    sortBy?: string
    sortDir?: 'asc' | 'desc'
    flowDateFrom?: string
    flowDateTo?: string
    createdAtFrom?: string
    createdAtTo?: string
    page?: number
    pageSize?: number
  }) {
    const page = parsePage(params.page)
    const pageSize = parsePageSize(params.pageSize)
    const { skip, take } = paginateArgs(page, pageSize)
    const and: Prisma.CashFlowWhereInput[] = []
    if (params.contractId?.trim()) and.push({ contractId: params.contractId.trim() })
    if (params.customerId?.trim()) and.push({ customerId: params.customerId.trim() })
    if (params.receiptId?.trim()) and.push({ receiptId: params.receiptId.trim() })
    if (params.refundOrderId?.trim()) and.push({ refundOrderId: params.refundOrderId.trim() })
    if (params.invoiceId?.trim()) {
      const invoiceId = params.invoiceId.trim()
      const inv = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { invoiceCode: true },
      })
      const invoiceCode = (inv?.invoiceCode || '').trim()
      and.push({
        OR: [
          { receipt: { invoiceId } },
          { receipt: { allocations: { some: { invoiceId } } } },
          {
            refundOrder: {
              items: {
                some: {
                  OR: [
                    { receivable: { invoiceId } },
                    { receipt: { invoiceId } },
                    { receipt: { allocations: { some: { invoiceId } } } },
                    ...(invoiceCode
                      ? [{ description: { startsWith: invoiceCode } }]
                      : []),
                  ],
                },
              },
            },
          },
        ],
      })
    }
    if (params.receivableId?.trim()) {
      const receivableId = params.receivableId.trim()
      const recv = await this.prisma.receivable.findUnique({
        where: { id: receivableId },
        select: { invoice: { select: { invoiceCode: true } } },
      })
      const invoiceCode = (recv?.invoice?.invoiceCode || '').trim()
      and.push({
        OR: [
          { receipt: { receivableId } },
          { receipt: { allocations: { some: { receivableId } } } },
          {
            refundOrder: {
              items: {
                some: {
                  OR: [
                    { receivableId },
                    { receipt: { receivableId } },
                    {
                      receipt: {
                        allocations: { some: { receivableId } },
                      },
                    },
                    ...(invoiceCode
                      ? [{ description: { startsWith: invoiceCode } }]
                      : []),
                  ],
                },
              },
            },
          },
        ],
      })
    }

    const directions = [
      ...(params.directions || []),
      ...(params.direction?.trim() ? [params.direction.trim()] : []),
    ]
    if (directions.length) {
      const valid = directions.filter((d) =>
        ['in', 'out'].includes(d),
      ) as CashFlowDirection[]
      if (valid.length === 1) and.push({ direction: valid[0] })
      else if (valid.length > 1) and.push({ direction: { in: valid } })
    }

    const sourceTypes = [
      ...(params.sourceTypes || []),
      ...(params.sourceType?.trim() ? [params.sourceType.trim()] : []),
    ]
    if (sourceTypes.length) {
      const valid = sourceTypes.filter((s) =>
        ['receipt', 'refund_order'].includes(s),
      ) as CashFlowSourceType[]
      if (valid.length === 1) and.push({ sourceType: valid[0] })
      else if (valid.length > 1) and.push({ sourceType: { in: valid } })
    }

    const flowCodeClause = stringFieldInOrEmpty('flowCode', params.flowCodes)
    if (flowCodeClause) and.push(flowCodeClause as Prisma.CashFlowWhereInput)

    const amountClause = numberFieldInOrEmpty('amount', params.amounts)
    if (amountClause) and.push(amountClause as Prisma.CashFlowWhereInput)

    const sourceRefClause = this.sourceRefWhere(params.sourceRefs)
    if (sourceRefClause) and.push(sourceRefClause)

    const contractSplit = splitEmptyFilter(params.contractCodes)
    if (contractSplit.values.length || contractSplit.includeEmpty) {
      const or: Prisma.CashFlowWhereInput[] = []
      if (contractSplit.values.length === 1) {
        or.push({ contract: { contractCode: contractSplit.values[0] } })
      } else if (contractSplit.values.length > 1) {
        or.push({ contract: { contractCode: { in: contractSplit.values } } })
      }
      if (contractSplit.includeEmpty) or.push({ contractId: null })
      and.push(or.length === 1 ? or[0]! : { OR: or })
    }

    const customerNameClause = stringFieldInOrEmpty('name', params.customerNames)
    if (customerNameClause) {
      and.push({ customer: customerNameClause as Prisma.CustomerWhereInput })
    }

    const receiptCountClause = this.linkCountWhere('receiptId', params.receiptCounts)
    if (receiptCountClause) and.push(receiptCountClause)
    const refundCountClause = this.linkCountWhere('refundOrderId', params.refundOrderCounts)
    if (refundCountClause) and.push(refundCountClause)

    const createdByClause = actorLabelsOrEmpty('createdBy', params.createdBys)
    if (createdByClause) and.push(createdByClause as Prisma.CashFlowWhereInput)

    const flowDate = dateRangeFilter(params.flowDateFrom, params.flowDateTo)
    if (flowDate) and.push({ flowDate })
    const createdAt = dateRangeFilter(params.createdAtFrom, params.createdAtTo, true)
    if (createdAt) and.push({ createdAt })

    const kw = params.keyword?.trim()
    if (kw) {
      and.push({
        OR: [
          { flowCode: { contains: kw, mode: 'insensitive' } },
          { remark: { contains: kw, mode: 'insensitive' } },
          { contract: { contractCode: { contains: kw, mode: 'insensitive' } } },
          { customer: { name: { contains: kw, mode: 'insensitive' } } },
          { receipt: { receiptCode: { contains: kw, mode: 'insensitive' } } },
          { refundOrder: { refundCode: { contains: kw, mode: 'insensitive' } } },
        ],
      })
    }
    const where: Prisma.CashFlowWhereInput = and.length ? { AND: and } : {}
    const orderBy = this.buildListOrderBy(params.sortBy, params.sortDir)
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.cashFlow.count({ where }),
      this.prisma.cashFlow.findMany({
        where,
        include,
        orderBy,
        skip,
        take,
      }),
    ])
    return {
      items: rows.map((r) => this.toDto(r)),
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    }
  }

  /** 页头快捷筛选计数：全部 / 入账 / 出账 */
  async countByDirection(): Promise<{ all: number; in: number; out: number }> {
    const rows = await this.prisma.cashFlow.groupBy({
      by: ['direction'],
      _count: { _all: true },
    })
    const counts = { all: 0, in: 0, out: 0 }
    for (const row of rows) {
      const n = Number((row._count as { _all?: number } | undefined)?._all ?? 0)
      counts.all += n
      if (row.direction === CashFlowDirection.in) counts.in += n
      else if (row.direction === CashFlowDirection.out) counts.out += n
    }
    return counts
  }

  async findOne(id: string) {
    const row = await this.prisma.cashFlow.findUnique({
      where: { id },
      include,
    })
    if (!row) throw new NotFoundException(`Cash flow ${id} not found`)
    return this.toDto(row)
  }

  /** 删除资金流水；若挂退款单则重算已打／结算已退 */
  async remove(id: string, actor = '') {
    const row = await this.prisma.cashFlow.findUnique({ where: { id } })
    if (!row) throw new NotFoundException(`Cash flow ${id} not found`)
    const refundOrderId = row.refundOrderId
    await this.prisma.cashFlow.delete({ where: { id } })
    const actorId = actor || null
    if (refundOrderId) {
      await this.refundOrders.syncPaidFromCashFlows(refundOrderId, actorId)
      const ro = await this.prisma.refundOrder.findUnique({
        where: { id: refundOrderId },
        select: { settlementId: true },
      })
      if (ro?.settlementId) {
        await this.settlements.recalcRefundTotals(ro.settlementId, actorId)
      }
    }
    return { success: true }
  }

  async removeMany(ids: string[], actor = '') {
    return runBatchRemove(ids, (id) => this.remove(id, actor))
  }

  /**
   * 批量导入资金流水：按来源类型 + 来源单据编号挂接收据／退款单。
   * 有流水编号且已存在则跳过；收据入账幂等，退款出账每次新建并重算已打。
   */
  async importBatch(
    dto: {
      items?: Array<{
        flowCode?: string
        direction?: string
        amount?: number
        flowDate?: string
        paymentMethod?: string
        sourceType?: string
        sourceRef?: string
        remark?: string
      }>
    },
    actor = '',
  ) {
    const items = dto.items || []
    let created = 0
    let skipped = 0
    let failed = 0
    const issues: ImportIssue[] = []

    const codeHints = [...new Set(items.map((it) => s(it.flowCode)).filter(Boolean))]
    const existingCodes = new Set(
      codeHints.length
        ? (
            await this.prisma.cashFlow.findMany({
              where: { flowCode: { in: codeHints } },
              select: { flowCode: true },
            })
          ).map((r) => r.flowCode.toLowerCase())
        : [],
    )

    for (const item of items) {
      const flowCode = s(item.flowCode)
      const sourceTypeRaw = s(item.sourceType).toLowerCase()
      const sourceRef = s(item.sourceRef)
      const keys = {
        流水編號: flowCode,
        來源類型: sourceTypeRaw,
        來源單據: sourceRef,
      }
      try {
        if (flowCode && existingCodes.has(flowCode.toLowerCase())) {
          skipped += 1
          pushImportIssue(issues, 'skipped', `流水编号「${flowCode}」已存在`, keys)
          continue
        }
        const amount = round2(Math.max(0, Number(item.amount) || 0))
        const flowDate = parseYmd(item.flowDate)
        if (amount <= 0.009 || !flowDate) {
          failed += 1
          pushImportIssue(issues, 'failed', '金额或发生日期无效', keys)
          continue
        }
        if (!sourceRef) {
          failed += 1
          pushImportIssue(issues, 'failed', '缺少来源单据编号', keys)
          continue
        }

        const sourceType =
          sourceTypeRaw === 'receipt' || sourceTypeRaw === '收据'
            ? 'receipt'
            : sourceTypeRaw === 'refund_order' ||
                sourceTypeRaw === 'refund' ||
                sourceTypeRaw === '退款单' ||
                sourceTypeRaw === '退款單'
              ? 'refund_order'
              : ''
        if (!sourceType) {
          failed += 1
          pushImportIssue(issues, 'failed', '来源类型须为 receipt 或 refund_order', keys)
          continue
        }

        if (sourceType === 'receipt') {
          const receipt = await this.prisma.receipt.findFirst({
            where: { receiptCode: sourceRef },
            select: {
              id: true,
              contractId: true,
              customerId: true,
              paymentMethod: true,
            },
          })
          if (!receipt?.customerId) {
            failed += 1
            pushImportIssue(issues, 'failed', `找不到收据「${sourceRef}」`, keys)
            continue
          }
          const before = await this.prisma.cashFlow.findFirst({
            where: {
              sourceType: CashFlowSourceType.receipt,
              sourceId: receipt.id,
              direction: CashFlowDirection.in,
            },
            select: { id: true },
          })
          const row = await this.cashFlows.recordReceiptIn({
            receiptId: receipt.id,
            amount,
            flowDate,
            paymentMethod: s(item.paymentMethod) || receipt.paymentMethod || undefined,
            contractId: receipt.contractId,
            customerId: receipt.customerId,
            remark: s(item.remark) || undefined,
            actorId: actor || null,
          })
          if (before) {
            skipped += 1
            pushImportIssue(issues, 'skipped', `收据「${sourceRef}」已有入账流水`, keys)
          } else if (row) {
            if (row.flowCode) existingCodes.add(row.flowCode.toLowerCase())
            created += 1
          } else {
            skipped += 1
          }
          continue
        }

        const refund = await this.prisma.refundOrder.findFirst({
          where: { refundCode: sourceRef },
          select: {
            id: true,
            contractId: true,
            customerId: true,
            settlementId: true,
            paymentMethod: true,
          },
        })
        if (!refund?.customerId) {
          failed += 1
          pushImportIssue(issues, 'failed', `找不到退款单「${sourceRef}」`, keys)
          continue
        }
        const row = await this.cashFlows.recordRefundOut({
          refundOrderId: refund.id,
          amount,
          flowDate,
          paymentMethod: s(item.paymentMethod) || refund.paymentMethod || undefined,
          contractId: refund.contractId,
          customerId: refund.customerId,
          remark: s(item.remark) || undefined,
          actorId: actor || null,
        })
        await this.refundOrders.syncPaidFromCashFlows(refund.id, actor || null)
        if (refund.settlementId) {
          await this.settlements.recalcRefundTotals(refund.settlementId, actor || null)
        }
        if (row?.flowCode) existingCodes.add(row.flowCode.toLowerCase())
        created += 1
      } catch (e) {
        failed += 1
        const msg = e instanceof Error ? e.message : String(e)
        pushImportIssue(issues, 'failed', msg, keys)
      }
    }

    return { created, skipped, failed, issues }
  }
}
