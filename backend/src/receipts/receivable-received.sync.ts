import {
  BookingDepositMovementType,
  Prisma,
  ReceiptKind,
  type PrismaClient,
} from '@prisma/client'
import { recalcSettlementCollectForReceivable } from '../contract-settlements/settlement-collect.sync'
import { BOOKING_DEPOSIT_OFFSET_METHOD } from './booking-deposit.constants'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function dec(n: number) {
  return new Prisma.Decimal(round2(n))
}

type DbClient = Prisma.TransactionClient | PrismaClient

/**
 * 应收金额口径：
 * - 已收 receivedAmount：历史累计实收
 *   = 全部发票现金收据分摊／旧头表挂账 + 定金抵扣 apply
 * - 已退 refundedAmount：本字段累加，同步时不覆盖（退款／实退按金等写入）
 * - 未收 receivableAmount = max(0, 开票 − 已收 + 已退)
 */
export async function syncReceivableReceivedAmount(
  db: DbClient,
  receivableId: string,
) {
  const id = (receivableId || '').trim()
  if (!id) return

  const recv = await db.receivable.findUnique({
    where: { id },
    select: { id: true, invoiceAmount: true, refundedAmount: true },
  })
  if (!recv) return

  const cashReceiptFilter = {
    NOT: { paymentMethod: BOOKING_DEPOSIT_OFFSET_METHOD },
  } as const

  const [allocations, legacyLinked, applies] = await Promise.all([
    db.receiptAllocation.findMany({
      where: {
        receivableId: id,
        receipt: {
          kind: ReceiptKind.invoice,
          ...cashReceiptFilter,
        },
      },
      select: {
        amount: true,
        receipt: { select: { receiptCode: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    db.receipt.findMany({
      where: {
        receivableId: id,
        kind: ReceiptKind.invoice,
        ...cashReceiptFilter,
        allocations: { none: {} },
      },
      select: { amount: true, receiptCode: true },
      orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
    }),
    db.bookingDepositMovement.findMany({
      where: {
        receivableId: id,
        type: BookingDepositMovementType.apply,
      },
      select: {
        amount: true,
        bookingDepositReceipt: { select: { receiptCode: true } },
      },
      orderBy: [{ movementDate: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  const cashFromAlloc = allocations.reduce((sum: number, a) => {
    const n = Number(a.amount.toString())
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
  const cashFromLegacy = legacyLinked.reduce((sum: number, r) => {
    const n = Number(r.amount.toString())
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
  const cashReceived = round2(cashFromAlloc + cashFromLegacy)
  const depositApplied = applies.reduce((sum: number, m) => {
    const n = Number(m.amount.toString())
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
  const received = round2(cashReceived + depositApplied)
  const refunded = round2(Number(recv.refundedAmount?.toString() ?? 0))
  const invoiceAmt = Number(recv.invoiceAmount.toString())
  const outstanding = Math.max(
    0,
    (Number.isFinite(invoiceAmt) ? invoiceAmt : 0) - received + refunded,
  )

  const refParts: string[] = [
    ...allocations
      .map((a) => a.receipt?.receiptCode)
      .filter((c): c is string => !!c?.trim()),
    ...legacyLinked.map((r) => r.receiptCode).filter(Boolean),
    ...applies
      .map((m) => m.bookingDepositReceipt?.receiptCode)
      .filter((c): c is string => !!c?.trim()),
  ]
  const seen = new Set<string>()
  const relatedReceiptRef = refParts
    .filter((c) => {
      if (seen.has(c)) return false
      seen.add(c)
      return true
    })
    .join(',')

  await db.receivable.update({
    where: { id },
    data: {
      receivedAmount: dec(received),
      receivableAmount: dec(outstanding),
      relatedReceiptRef,
    },
  })

  await recalcSettlementCollectForReceivable(db, id)
}

/** 累加已退金额并重算未收（不覆盖已有已退之外的部分） */
export async function incrementReceivableRefundedAmount(
  db: DbClient,
  receivableId: string,
  amount: number,
) {
  const id = (receivableId || '').trim()
  const add = round2(Math.max(0, Number(amount) || 0))
  if (!id || add <= 0.009) return

  const recv = await db.receivable.findUnique({
    where: { id },
    select: {
      invoiceAmount: true,
      receivedAmount: true,
      refundedAmount: true,
    },
  })
  if (!recv) return

  const received = round2(Number(recv.receivedAmount.toString()))
  const refunded = round2(Number(recv.refundedAmount.toString()) + add)
  const invoiceAmt = round2(Number(recv.invoiceAmount.toString()))
  const outstanding = Math.max(0, invoiceAmt - received + refunded)

  await db.receivable.update({
    where: { id },
    data: {
      refundedAmount: dec(refunded),
      receivableAmount: dec(outstanding),
    },
  })
}

/** 同步多张应收的已收（去重） */
export async function syncReceivableReceivedAmounts(
  db: DbClient,
  receivableIds: Array<string | null | undefined>,
) {
  const seen = new Set<string>()
  for (const raw of receivableIds) {
    const id = (raw || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    await syncReceivableReceivedAmount(db, id)
  }
}

function isDepositInvoiceType(v?: string | null) {
  const t = (v || '').trim().toLowerCase()
  if (!t) return false
  if (t === 'deposit' || t === 'room_deposit' || t === 'security_deposit') return true
  return t.includes('按金') || t.includes('押金')
}

/**
 * 取消合约结算「定金抵扣」：抵扣动账仍留在已收，另累加已退（记退／没收均清掉应退容量）。
 * @param amountLimit 若传入，则最多记退该金额（FIFO 按 apply 动账）；缺省为全部抵扣额。
 */
export async function incrementRefundedForDepositApplies(
  db: DbClient,
  receivableIds: Array<string | null | undefined>,
  amountLimit?: number,
) {
  const ids = [
    ...new Set(
      receivableIds.map((x) => (x || '').trim()).filter(Boolean),
    ),
  ]
  if (!ids.length) return

  let budget =
    amountLimit == null || !Number.isFinite(amountLimit)
      ? Number.POSITIVE_INFINITY
      : Math.max(0, round2(amountLimit))
  if (budget <= 0.009) return

  const applies = await db.bookingDepositMovement.findMany({
    where: {
      receivableId: { in: ids },
      type: BookingDepositMovementType.apply,
    },
    select: { receivableId: true, amount: true },
    orderBy: [{ movementDate: 'asc' }, { createdAt: 'asc' }],
  })
  for (const m of applies) {
    if (budget <= 0.009) break
    const rid = (m.receivableId || '').trim()
    if (!rid) continue
    const amt = Number(m.amount.toString())
    if (!Number.isFinite(amt) || amt <= 0.009) continue
    const recv = await db.receivable.findUnique({
      where: { id: rid },
      select: { receivedAmount: true, refundedAmount: true },
    })
    if (!recv) continue
    const capacity = round2(
      Math.max(
        0,
        Number(recv.receivedAmount.toString()) - Number(recv.refundedAmount.toString()),
      ),
    )
    const slice = round2(Math.min(amt, capacity, budget))
    if (slice <= 0.009) continue
    await incrementReceivableRefundedAmount(db, rid, slice)
    budget = round2(Math.max(0, budget - slice))
  }
}

/**
 * 退租／按金退还实退：按 FIFO 把实退金额摊到合约下按金应收的「已退」
 * （容量 = 已收 − 已退，避免重复办理超记）
 */
export async function allocateRoomDepositRefundToReceivables(
  db: DbClient,
  contractId: string,
  refundAmount: number,
) {
  const cid = (contractId || '').trim()
  let remaining = round2(Math.max(0, Number(refundAmount) || 0))
  if (!cid || remaining <= 0.009) return

  const rows = await db.receivable.findMany({
    where: {
      contractId: cid,
      invoice: { status: { not: '已取消' } },
    },
    select: {
      id: true,
      receivedAmount: true,
      refundedAmount: true,
      invoice: { select: { invoiceType: true, description: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  for (const r of rows) {
    if (remaining <= 0.009) break
    if (
      !isDepositInvoiceType(r.invoice?.invoiceType) &&
      !isDepositInvoiceType(r.invoice?.description)
    ) {
      continue
    }
    const received = round2(Number(r.receivedAmount.toString()))
    const refunded = round2(Number(r.refundedAmount.toString()))
    const capacity = round2(Math.max(0, received - refunded))
    if (capacity <= 0.009) continue
    const slice = round2(Math.min(capacity, remaining))
    await incrementReceivableRefundedAmount(db, r.id, slice)
    remaining = round2(remaining - slice)
  }
}

function refundItemLeadingCode(description?: string | null): string {
  const raw = (description || '').trim()
  if (!raw || raw === '需退') return ''
  const noDue = raw.replace(/\s*需退\s*$/u, '').trim()
  return (noDue.split(/\s+/)[0] || '').trim()
}

/** 按发票编号 FIFO 把退款记入该发票下属应收「已退」（容量=已收−已退） */
export async function allocateInvoiceCashRefundByCode(
  db: DbClient,
  contractId: string,
  invoiceCode: string,
  refundAmount: number,
) {
  const cid = (contractId || '').trim()
  const code = (invoiceCode || '').trim()
  let remaining = round2(Math.max(0, Number(refundAmount) || 0))
  if (!cid || !code || remaining <= 0.009) return

  const invoice = await db.invoice.findFirst({
    where: { contractId: cid, invoiceCode: code },
    select: {
      receivables: {
        select: {
          id: true,
          receivedAmount: true,
          refundedAmount: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!invoice?.receivables?.length) return

  for (const r of invoice.receivables) {
    if (remaining <= 0.009) break
    const received = round2(Number(r.receivedAmount.toString()))
    const refunded = round2(Number(r.refundedAmount.toString()))
    const capacity = round2(Math.max(0, received - refunded))
    if (capacity <= 0.009) continue
    const slice = round2(Math.min(capacity, remaining))
    await incrementReceivableRefundedAmount(db, r.id, slice)
    remaining = round2(remaining - slice)
  }
}

type RefundOrderItemLike = {
  itemType?: string | null
  description?: string | null
  amount?: Prisma.Decimal | number | null
  receivableId?: string | null
  sortOrder?: number | null
}

/**
 * 退款单打款后：按明细 FIFO（先扣已打再摊本次）回写应收「已退」。
 * - invoice_cash：优先 receivableId；否则按 description 发票号摊到该发票应收
 * - room_deposit：摊到合约按金类应收
 * - booking_deposit：无对应应收，跳过
 */
export async function allocateRefundOrderPayoutToReceivables(
  db: DbClient,
  params: {
    contractId: string
    items: RefundOrderItemLike[]
    /** 打款前已打合计 */
    paidBefore: number
    /** 本次打款 */
    payAmount: number
  },
) {
  const cid = (params.contractId || '').trim()
  const pay = round2(Math.max(0, Number(params.payAmount) || 0))
  if (!cid || pay <= 0.009) return

  const sorted = [...(params.items || [])].sort(
    (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0),
  )

  let paidLeft = round2(Math.max(0, Number(params.paidBefore) || 0))
  const remainingRows: Array<{
    itemType: string
    description: string
    receivableId: string
    due: number
  }> = []

  for (const it of sorted) {
    const full = round2(Number(it.amount?.toString?.() ?? it.amount ?? 0))
    if (full <= 0.009) continue
    const covered = round2(Math.min(full, paidLeft))
    paidLeft = round2(Math.max(0, paidLeft - covered))
    const due = round2(Math.max(0, full - covered))
    if (due <= 0.009) continue
    remainingRows.push({
      itemType: (it.itemType || '').trim() || 'other',
      description: (it.description || '').trim(),
      receivableId: (it.receivableId || '').trim(),
      due,
    })
  }

  let left = pay
  for (const row of remainingRows) {
    if (left <= 0.009) break
    const slice = round2(Math.min(row.due, left))
    if (slice <= 0.009) continue
    left = round2(Math.max(0, left - slice))

    if (row.itemType === 'room_deposit') {
      await allocateRoomDepositRefundToReceivables(db, cid, slice)
      continue
    }

    if (row.itemType === 'invoice_cash' || row.itemType === 'other') {
      if (row.receivableId) {
        const recv = await db.receivable.findUnique({
          where: { id: row.receivableId },
          select: { receivedAmount: true, refundedAmount: true },
        })
        if (recv) {
          const capacity = round2(
            Math.max(
              0,
              Number(recv.receivedAmount.toString()) -
                Number(recv.refundedAmount.toString()),
            ),
          )
          const take = round2(Math.min(capacity, slice))
          if (take > 0.009) {
            await incrementReceivableRefundedAmount(db, row.receivableId, take)
          }
        }
        continue
      }
      const code = refundItemLeadingCode(row.description)
      if (code) {
        await allocateInvoiceCashRefundByCode(db, cid, code, slice)
      }
    }
  }
}
