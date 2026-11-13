import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  StreamableFile,
  forwardRef,
} from '@nestjs/common'
import { Prisma, RefundOrderStatus } from '@prisma/client'
import { createReadStream } from 'fs'
import * as fs from 'fs/promises'
import * as path from 'path'
import { PrismaService } from '../prisma/prisma.service'
import {
  dateRangeFilter,
  paginateArgs,
  parsePage,
  parsePageSize,
  parseSortDir,
} from '../common/pagination'
import { actorLabelsOrEmpty, auditActorLabel, auditUserInclude } from '../common/audit'
import {
  numberFieldInOrEmpty,
  splitEmptyFilter,
  stringFieldInOrEmpty,
} from '../common/column-filter'
import { allocateRefundOrderPayoutToReceivables } from '../receipts/receivable-received.sync'
import { BookingDepositService } from '../receipts/booking-deposit.service'
import { RefundOrdersService } from './refund-orders.service'
import { ContractSettlementsService } from './contract-settlements.service'
import { round2 } from './settlement-code.util'

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

function parseDateOnly(v: string | null | undefined, field: string): Date {
  const raw = (v || '').trim()
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`)
  }
  return new Date(`${raw}T00:00:00.000Z`)
}

function s(v?: string | null) {
  return (v || '').trim()
}

function uploadsRoot() {
  return path.join(process.cwd(), 'uploads')
}

function decodeMulterFilename(name: string): string {
  const raw = s(name)
  if (!raw) return raw
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8')
    if (decoded.includes('\uFFFD')) return raw
    const rawHasCjk = /[\u4e00-\u9fff]/.test(raw)
    const decodedHasCjk = /[\u4e00-\u9fff]/.test(decoded)
    if (!rawHasCjk && decodedHasCjk) return decoded
    return raw
  } catch {
    return raw
  }
}

function safeAttachmentFileName(original: string): string {
  const decoded = decodeMulterFilename(original) || 'file.bin'
  const base = path.basename(decoded).replace(/[\\/]/g, '_')
  if (!base || base.includes('..')) {
    throw new BadRequestException('非法文件名')
  }
  return base
}

function assertAttachmentFile(file: Express.Multer.File) {
  if (!file?.buffer?.length) {
    throw new BadRequestException('请上传文件')
  }
  return { fileName: safeAttachmentFileName(file.originalname), buffer: file.buffer }
}

function mimeFromFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  return map[ext] || 'application/octet-stream'
}

function isExternalAttachmentKey(storageKey: string): boolean {
  return /^https?:\/\//i.test((storageKey || '').trim())
}

function attachmentStorageRel(storageKey: string): string {
  return (storageKey || '').trim().replace(/^\/+/, '')
}

function attachmentPublicUrl(storageKey: string): string | undefined {
  const key = (storageKey || '').trim()
  if (!key) return undefined
  if (/^https?:\/\//i.test(key)) return key
  const rel = attachmentStorageRel(key)
  if (!rel || rel.includes('..')) return undefined
  return `/files/${rel}`
}

function handlerLabel(u?: { account: string; displayName: string | null } | null) {
  if (!u) return ''
  return (u.displayName || '').trim() || u.account
}

const include = {
  contract: { select: { id: true, contractCode: true } },
  customer: { select: { id: true, customerCode: true, name: true } },
  room: { select: { id: true, roomCode: true, name: true } },
  settlement: {
    select: {
      id: true,
      settlementCode: true,
      type: true,
      refundStatus: true,
      collectStatus: true,
      refundDueTotal: true,
      refundedTotal: true,
      collectDueTotal: true,
      collectedTotal: true,
    },
  },
  handlerUser: { select: { id: true, account: true, displayName: true } },
  items: { orderBy: { sortOrder: 'asc' as const } },
  attachments: { orderBy: { sortOrder: 'asc' as const } },
  _count: { select: { items: true, attachments: true, cashFlows: true } },
  ...auditUserInclude,
} satisfies Prisma.RefundOrderInclude

@Injectable()
export class RefundOrdersQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refundOrders: RefundOrdersService,
    private readonly settlements: ContractSettlementsService,
    @Inject(forwardRef(() => BookingDepositService))
    private readonly bookingDeposit: BookingDepositService,
  ) {}

  private toAttachmentDto(row: {
    id: string
    refundOrderId: string
    fileName: string
    storageKey: string
    sortOrder: number
  }) {
    return {
      id: row.id,
      refundOrderId: row.refundOrderId,
      fileName: row.fileName,
      sortOrder: row.sortOrder,
      publicUrl: attachmentPublicUrl(row.storageKey),
    }
  }

  private async loadPaidStateMap(ids: string[]) {
    const map = new Map<string, { paidAmount: number; status: string }>()
    if (!ids.length) return map
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; paid_amount: Prisma.Decimal; status: string }>
    >`
      SELECT id, paid_amount, status::text AS status
      FROM refund_orders
      WHERE id IN (${Prisma.join(ids)})
    `
    for (const r of rows) {
      map.set(r.id, { paidAmount: num(r.paid_amount), status: r.status })
    }
    return map
  }

  private toDto(
    row: any,
    paidState?: { paidAmount: number; status: string },
  ) {
    const amount = num(row.amount)
    const paidAmount = paidState?.paidAmount ?? num(row.paidAmount)
    const status = paidState?.status ?? row.status
    return {
      id: row.id,
      refundCode: row.refundCode,
      status,
      contractId: row.contractId,
      contractCode: row.contract?.contractCode ?? '',
      customerId: row.customerId,
      customerCode: row.customer?.customerCode ?? '',
      customerName: row.customer?.name ?? '',
      roomId: row.roomId,
      roomCode: row.room?.roomCode ?? '',
      roomName: row.room?.name ?? '',
      settlementId: row.settlementId,
      settlementCode: row.settlement?.settlementCode ?? '',
      settlementType: row.settlement?.type ?? '',
      settlementStatus: row.settlement?.refundStatus ?? '',
      settlementRefundStatus: row.settlement?.refundStatus ?? '',
      settlementCollectStatus: row.settlement?.collectStatus ?? '',
      settlementRefundDueTotal: num(row.settlement?.refundDueTotal),
      settlementRefundedTotal: num(row.settlement?.refundedTotal),
      settlementRefundRemaining: round2(
        Math.max(
          0,
          num(row.settlement?.refundDueTotal) - num(row.settlement?.refundedTotal),
        ),
      ),
      depositRefundId: row.depositRefundId,
      amount,
      paidAmount,
      remainingAmount: round2(Math.max(0, amount - paidAmount)),
      refundDate: dateOnly(row.refundDate),
      paymentMethod: row.paymentMethod ?? '',
      handlerId: row.handlerId,
      handler: handlerLabel(row.handlerUser),
      remark: row.remark ?? '',
      itemCount: row._count?.items ?? row.items?.length ?? 0,
      attachmentCount: row._count?.attachments ?? row.attachments?.length ?? 0,
      cashFlowCount: row._count?.cashFlows ?? 0,
      items: (row.items || []).map((it: any) => ({
        id: it.id,
        itemType: it.itemType,
        description: it.description,
        amount: num(it.amount),
        receivableId: it.receivableId,
        receiptId: it.receiptId,
        settlementItemId: it.settlementItemId,
        sortOrder: it.sortOrder,
        remark: it.remark ?? '',
      })),
      attachments: (row.attachments || []).map((a: any) => this.toAttachmentDto(a)),
      createdBy: auditActorLabel(row.createdByUser),
      updatedBy: auditActorLabel(row.updatedByUser),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.RefundOrderOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'asc'
    const key = (sortBy || '').trim()
    if (!key) return [{ createdAt: 'desc' }]
    if (key === 'refundCode') return [{ refundCode: dir }]
    if (key === 'status') return [{ status: dir }]
    if (key === 'contractCode') return [{ contract: { contractCode: dir } }]
    if (key === 'customerName') return [{ customer: { name: dir } }]
    if (key === 'settlementCode') return [{ settlement: { settlementCode: dir } }]
    if (key === 'amount') return [{ amount: dir }]
    if (key === 'paidAmount') return [{ paidAmount: dir }]
    // remaining = amount − paidAmount：按应退降序/已退升序近似
    if (key === 'remainingAmount') {
      return [{ amount: dir }, { paidAmount: dir === 'asc' ? 'desc' : 'asc' }]
    }
    if (key === 'itemCount') return [{ items: { _count: dir } }]
    if (key === 'attachmentCount') return [{ attachments: { _count: dir } }]
    if (key === 'cashFlowCount') return [{ cashFlows: { _count: dir } }]
    if (key === 'createdBy') {
      return [{ createdByUser: { displayName: dir } }, { createdByUser: { account: dir } }]
    }
    if (key === 'createdAt') return [{ createdAt: dir }]
    return [{ createdAt: 'desc' }]
  }

  /** 待退金额筛选：amount − paid_amount */
  private async resolveRemainingFilterIds(
    remainings?: string[],
  ): Promise<string[] | null> {
    const nums = (remainings || [])
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .map((n) => Math.round(n * 100) / 100)
    if (!nums.length) return null
    const matched = new Set<string>()
    for (const n of [...new Set(nums)]) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM refund_orders
         WHERE ROUND(
           (COALESCE(amount, 0) - COALESCE(paid_amount, 0))::numeric,
           2
         ) = $1::numeric`,
        n,
      )
      for (const r of rows) matched.add(r.id)
    }
    return [...matched]
  }

  /** 明细／凭证／流水数量筛选 */
  private async resolveCountFilterIds(params: {
    itemCounts?: string[]
    attachmentCounts?: string[]
    cashFlowCounts?: string[]
  }): Promise<string[] | null> {
    const specs: Array<{
      raw?: string[]
      table: 'refund_items' | 'refund_order_attachments' | 'cash_flows'
      fk: string
    }> = [
      { raw: params.itemCounts, table: 'refund_items', fk: 'refund_order_id' },
      {
        raw: params.attachmentCounts,
        table: 'refund_order_attachments',
        fk: 'refund_order_id',
      },
      { raw: params.cashFlowCounts, table: 'cash_flows', fk: 'refund_order_id' },
    ]
    let ids: Set<string> | null = null
    for (const spec of specs) {
      const nums = (spec.raw || [])
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n >= 0)
        .map((n) => Math.floor(n))
      if (!nums.length) continue
      const matched = new Set<string>()
      for (const n of [...new Set(nums)]) {
        if (n === 0) {
          const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT o.id FROM refund_orders o
             WHERE NOT EXISTS (
               SELECT 1 FROM ${spec.table} t WHERE t.${spec.fk} = o.id
             )`,
          )
          for (const r of rows) matched.add(r.id)
        } else {
          const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT o.id FROM refund_orders o
             WHERE (
               SELECT COUNT(*)::int FROM ${spec.table} t WHERE t.${spec.fk} = o.id
             ) = $1`,
            n,
          )
          for (const r of rows) matched.add(r.id)
        }
      }
      if (ids == null) ids = matched
      else ids = new Set([...ids].filter((id) => matched.has(id)))
    }
    return ids == null ? null : [...ids]
  }

  async findAll(params: {
    keyword?: string
    contractId?: string
    customerId?: string
    settlementId?: string
    status?: string
    refundCodes?: string[]
    statuses?: string[]
    contractCodes?: string[]
    customerNames?: string[]
    settlementCodes?: string[]
    itemCounts?: string[]
    attachmentCounts?: string[]
    cashFlowCounts?: string[]
    amounts?: string[]
    paidAmounts?: string[]
    remainingAmounts?: string[]
    createdBys?: string[]
    sortBy?: string
    sortDir?: 'asc' | 'desc'
    createdAtFrom?: string
    createdAtTo?: string
    page?: number
    pageSize?: number
  }) {
    const page = parsePage(params.page)
    const pageSize = parsePageSize(params.pageSize)
    const { skip, take } = paginateArgs(page, pageSize)
    const and: Prisma.RefundOrderWhereInput[] = []
    if (params.contractId?.trim()) and.push({ contractId: params.contractId.trim() })
    if (params.customerId?.trim()) and.push({ customerId: params.customerId.trim() })
    if (params.settlementId?.trim()) and.push({ settlementId: params.settlementId.trim() })

    const statuses = [
      ...(params.statuses || []),
      ...(params.status?.trim()
        ? params.status.split(',').map((s) => s.trim()).filter(Boolean)
        : []),
    ]
    if (statuses.length) {
      const valid = statuses.filter((s) =>
        ['pending', 'partial', 'paid', 'cancelled'].includes(s),
      ) as RefundOrderStatus[]
      if (valid.length === 1) and.push({ status: valid[0] })
      else if (valid.length > 1) and.push({ status: { in: valid } })
    }

    const refundCodeClause = stringFieldInOrEmpty('refundCode', params.refundCodes)
    if (refundCodeClause) and.push(refundCodeClause as Prisma.RefundOrderWhereInput)

    const contractCodeClause = stringFieldInOrEmpty('contractCode', params.contractCodes)
    if (contractCodeClause) {
      and.push({ contract: contractCodeClause as Prisma.ContractWhereInput })
    }
    const customerNameClause = stringFieldInOrEmpty('name', params.customerNames)
    if (customerNameClause) {
      and.push({ customer: customerNameClause as Prisma.CustomerWhereInput })
    }
    const settlementSplit = splitEmptyFilter(params.settlementCodes)
    if (settlementSplit.values.length || settlementSplit.includeEmpty) {
      const or: Prisma.RefundOrderWhereInput[] = []
      if (settlementSplit.values.length === 1) {
        or.push({ settlement: { settlementCode: settlementSplit.values[0] } })
      } else if (settlementSplit.values.length > 1) {
        or.push({ settlement: { settlementCode: { in: settlementSplit.values } } })
      }
      if (settlementSplit.includeEmpty) or.push({ settlementId: null })
      and.push(or.length === 1 ? or[0]! : { OR: or })
    }

    const amountClause = numberFieldInOrEmpty('amount', params.amounts)
    if (amountClause) and.push(amountClause as Prisma.RefundOrderWhereInput)
    const paidClause = numberFieldInOrEmpty('paidAmount', params.paidAmounts)
    if (paidClause) and.push(paidClause as Prisma.RefundOrderWhereInput)

    const remainingIds = await this.resolveRemainingFilterIds(params.remainingAmounts)
    if (remainingIds) {
      if (!remainingIds.length) and.push({ id: '__none__' })
      else and.push({ id: { in: remainingIds } })
    }

    const createdByClause = actorLabelsOrEmpty('createdBy', params.createdBys)
    if (createdByClause) and.push(createdByClause as Prisma.RefundOrderWhereInput)

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
          { refundCode: { contains: kw, mode: 'insensitive' } },
          { remark: { contains: kw, mode: 'insensitive' } },
          { contract: { contractCode: { contains: kw, mode: 'insensitive' } } },
          { customer: { name: { contains: kw, mode: 'insensitive' } } },
          { room: { roomCode: { contains: kw, mode: 'insensitive' } } },
          { settlement: { settlementCode: { contains: kw, mode: 'insensitive' } } },
        ],
      })
    }
    const where: Prisma.RefundOrderWhereInput = and.length ? { AND: and } : {}
    const orderBy = this.buildListOrderBy(params.sortBy, params.sortDir)

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.refundOrder.count({ where }),
      this.prisma.refundOrder.findMany({
        where,
        include,
        orderBy,
        skip,
        take,
      }),
    ])

    const paidMap = await this.loadPaidStateMap(rows.map((r) => r.id))
    return {
      items: rows.map((r) => this.toDto(r, paidMap.get(r.id))),
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    }
  }

  async findOne(id: string) {
    const row = await this.prisma.refundOrder.findUnique({
      where: { id },
      include,
    })
    if (!row) throw new NotFoundException(`Refund order ${id} not found`)
    const paidMap = await this.loadPaidStateMap([id])
    return this.toDto(row, paidMap.get(id))
  }

  /** 删除退款单（先删出账流水与凭证文件；明细／附件 Cascade） */
  async remove(id: string, actor = '') {
    const existing = await this.prisma.refundOrder.findUnique({
      where: { id },
      include: { attachments: true },
    })
    if (!existing) throw new NotFoundException(`Refund order ${id} not found`)
    const actorId = actor || null
    const settlementId = existing.settlementId
    const attachmentKeys = (existing.attachments || []).map((a) => a.storageKey)

    await this.prisma.$transaction(async (tx) => {
      await tx.cashFlow.deleteMany({ where: { refundOrderId: id } })
      await tx.refundOrder.delete({ where: { id } })
    })

    for (const key of attachmentKeys) {
      await this.removeStoredAttachmentFile(key)
    }

    if (settlementId) {
      await this.settlements.recalcRefundTotals(settlementId, actorId)
    }
    return { success: true }
  }

  async markPaid(
    id: string,
    dto: {
      amount?: number
      refundDate?: string
      paymentMethod?: string
      handlerId?: string | null
      remark?: string
    },
    actor = '',
  ) {
    return this.disburse(id, dto, actor)
  }

  /**
   * 对退款单打款（可全额或部分）：写一条资金流水，不新建退款单。
   */
  async disburse(
    id: string,
    dto: {
      amount?: number
      refundDate?: string
      paymentMethod?: string
      handlerId?: string | null
      remark?: string
    },
    actor = '',
  ) {
    const existing = await this.prisma.refundOrder.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!existing) throw new NotFoundException(`Refund order ${id} not found`)
    if (existing.status === RefundOrderStatus.paid) {
      return this.findOne(id)
    }
    if (existing.status === RefundOrderStatus.cancelled) {
      throw new BadRequestException('已取消的退款单不可打款')
    }
    const refundDate = dto.refundDate
      ? parseDateOnly(dto.refundDate, 'refundDate')
      : new Date()
    const actorId = actor || null
    const handlerId =
      dto.handlerId !== undefined ? s(dto.handlerId) || null : existing.handlerId || actorId
    if (handlerId) {
      const u = await this.prisma.user.findUnique({
        where: { id: handlerId },
        select: { id: true },
      })
      if (!u) throw new BadRequestException('Invalid handlerId')
    }

    const paidBefore = num((existing as { paidAmount?: Prisma.Decimal }).paidAmount)
    const due = num(existing.amount)
    const remaining = round2(Math.max(0, due - paidBefore))
    const pay =
      dto.amount != null
        ? round2(Math.max(0, Number(dto.amount) || 0))
        : remaining

    await this.refundOrders.disburse(id, {
      amount: pay,
      refundDate,
      paymentMethod: dto.paymentMethod,
      handlerId,
      actorId,
      remark: dto.remark,
    })

    // 本次打款按明细 FIFO 回写应收「已退」（发票现金／按金）
    if (pay > 0.009) {
      await allocateRefundOrderPayoutToReceivables(this.prisma, {
        contractId: existing.contractId,
        items: existing.items || [],
        paidBefore,
        payAmount: pay,
      })
    }

    if (existing.settlementId) {
      await this.settlements.recalcRefundTotals(existing.settlementId, actorId)
    }
    if (existing.depositRefundId) {
      await this.syncDepositRefundLedger(
        existing.depositRefundId,
        dateOnly(refundDate),
        actorId,
      )
    }
    return this.findOne(id)
  }

  /** 按退款单已打合计回写按金退还档：累计已退按金、状态、定金动账 */
  private async syncDepositRefundLedger(
    depositRefundId: string,
    refundDateYmd: string | null,
    actorId?: string | null,
  ) {
    const dr = await this.prisma.depositRefund.findUnique({
      where: { id: depositRefundId },
    })
    if (!dr) return

    const orders = await this.prisma.refundOrder.findMany({
      where: {
        depositRefundId,
        status: { not: RefundOrderStatus.cancelled },
      },
      include: { items: true },
    })

    let roomRefunded = 0
    let bookingOnPaid = 0
    for (const o of orders) {
      const paid = num((o as { paidAmount?: Prisma.Decimal }).paidAmount)
      const due = num(o.amount)
      if (due <= 0.009 || paid <= 0.009) continue
      const ratio = Math.min(1, paid / due)
      for (const it of o.items || []) {
        const share = round2(Number(it.amount.toString()) * ratio)
        if (it.itemType === 'room_deposit') roomRefunded = round2(roomRefunded + share)
        if (it.itemType === 'booking_deposit') bookingOnPaid = round2(bookingOnPaid + share)
      }
    }

    const refundDue = round2(Number(dr.refundDueAmount?.toString() ?? 0))
    let status = '未退'
    if (roomRefunded > 0.009) {
      status =
        refundDue <= 0.009 || roomRefunded + 0.009 >= refundDue ? '已退' : '部分已退'
    }

    const latestPaidDate = orders
      .map((o) => o.refundDate)
      .filter(Boolean)
      .sort((a, b) => (a! > b! ? -1 : 1))[0]

    await this.prisma.depositRefund.update({
      where: { id: depositRefundId },
      data: {
        actualRefundAmount: new Prisma.Decimal(roomRefunded),
        status,
        refundDate: latestPaidDate ?? dr.refundDate,
        updatedById: actorId || null,
      },
    })

    const bookingTarget =
      status === '已退' || status === '部分已退'
        ? Number(dr.bookingDepositRefundAmount.toString())
        : 0
    if (bookingTarget > 0.009 && (bookingOnPaid > 0.009 || status !== '未退')) {
      await this.bookingDeposit.syncDepositRefundBookingAmount(
        depositRefundId,
        dr.contractId,
        bookingTarget,
        refundDateYmd || (latestPaidDate ? dateOnly(latestPaidDate) : null),
        actorId,
      )
    } else if (status === '未退') {
      await this.bookingDeposit.syncDepositRefundBookingAmount(
        depositRefundId,
        dr.contractId,
        0,
        null,
        actorId,
      )
    }
  }

  private absPath(storageKey: string) {
    const rel = attachmentStorageRel(storageKey)
    if (!rel || rel.includes('..')) throw new BadRequestException('非法存储路径')
    return path.join(uploadsRoot(), rel)
  }

  private storageKeyForAttachment(refundOrderId: string, fileName: string) {
    const id = s(refundOrderId)
    const base = path.basename(s(fileName))
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      throw new BadRequestException('非法退款单 ID')
    }
    if (!base || base.includes('..') || base.includes('/') || base.includes('\\')) {
      throw new BadRequestException('非法文件名')
    }
    return `refund-orders/${id}/${Date.now()}_${base}`
  }

  private async removeStoredAttachmentFile(storageKey: string) {
    if (!storageKey || isExternalAttachmentKey(storageKey)) return
    const rel = attachmentStorageRel(storageKey)
    if (rel.startsWith('attachments/') || rel.startsWith('deposit-refunds/')) return
    await fs.rm(this.absPath(storageKey), { force: true }).catch(() => undefined)
  }

  async uploadAttachments(
    refundOrderId: string,
    files: Express.Multer.File[],
    actor = '',
  ) {
    const row = await this.prisma.refundOrder.findUnique({ where: { id: refundOrderId } })
    if (!row) throw new NotFoundException('Refund order not found')
    if (!files?.length) throw new BadRequestException('请至少上传一个文件')

    const maxSort = await this.prisma.refundOrderAttachment.aggregate({
      where: { refundOrderId },
      _max: { sortOrder: true },
    })
    let nextSort = (maxSort._max.sortOrder ?? -1) + 1
    const actorId = actor || null
    const created = []

    for (const file of files) {
      const { fileName, buffer } = assertAttachmentFile(file)
      const storageKey = this.storageKeyForAttachment(refundOrderId, fileName)
      const abs = this.absPath(storageKey)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, buffer)
      const att = await this.prisma.refundOrderAttachment.create({
        data: {
          refundOrderId,
          fileName,
          storageKey,
          sortOrder: nextSort++,
          createdById: actorId,
          updatedById: actorId,
        },
      })
      created.push(this.toAttachmentDto(att))
    }
    return created
  }

  async removeAttachment(refundOrderId: string, attachmentId: string) {
    const att = await this.prisma.refundOrderAttachment.findFirst({
      where: { id: attachmentId, refundOrderId },
    })
    if (!att) throw new NotFoundException('Refund order attachment not found')
    await this.prisma.refundOrderAttachment.delete({ where: { id: attachmentId } })
    await this.removeStoredAttachmentFile(att.storageKey)
    return { success: true }
  }

  async getAttachmentFile(
    refundOrderId: string,
    attachmentId: string,
  ): Promise<StreamableFile> {
    const att = await this.prisma.refundOrderAttachment.findFirst({
      where: { id: attachmentId, refundOrderId },
    })
    if (!att) throw new NotFoundException('Refund order attachment not found')
    if (isExternalAttachmentKey(att.storageKey)) {
      throw new BadRequestException('该附件为外部地址，请直接使用 publicUrl')
    }
    const abs = this.absPath(att.storageKey)
    try {
      await fs.access(abs)
    } catch {
      throw new NotFoundException('附件文件不存在')
    }
    return new StreamableFile(createReadStream(abs), {
      type: mimeFromFileName(att.fileName),
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
    })
  }
}
