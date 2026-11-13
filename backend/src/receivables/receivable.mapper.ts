import type { Contract, Customer, DepositRefund, Invoice, Receivable } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit'
import { BOOKING_DEPOSIT_OFFSET_METHOD } from '../receipts/booking-deposit.constants'

export type ReceivableBookingDepositApplyDto = {
  id: string
  amount: number
  movementDate: string
  bookingDepositReceiptId: string
  bookingDepositReceiptCode: string
  remark: string
}

function iso(d: Date) {
  return d.toISOString()
}

function dateOnly(d: Date | null | undefined): string {
  if (!d) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null
  if (typeof value === 'number') return value
  return Number(value.toString())
}

export type ReceivableReceiptSummary = {
  id: string
  receiptCode: string
  paymentDate: Date | null
  paymentMethod: string
  amount: Prisma.Decimal | number
  remark: string
  _count?: { attachments: number }
  attachments?: Array<{ id: string }>
}

export type ReceivableAllocationSummary = {
  id: string
  amount: Prisma.Decimal | number
  /** 详情 include 会带上；列表仅有 _count 时可能缺省 */
  receipt?: ReceivableReceiptSummary | null
}

export type ReceivableWithRelations = Receivable & {
  _count?: { receipts: number; receiptAllocations: number }
  receipts?: ReceivableReceiptSummary[]
  receiptAllocations?: ReceivableAllocationSummary[]
  invoice?: Pick<Invoice, 'id' | 'invoiceCode' | 'invoiceType' | 'description' | 'status'> | null
  contract?: Pick<Contract, 'id' | 'contractCode'> | null
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null
  depositRefund?: Pick<DepositRefund, 'id' | 'refundCode'> | null
  createdByUser?: AuditUserRef | null
  updatedByUser?: AuditUserRef | null
}

const receiptSummarySelect = {
  id: true,
  receiptCode: true,
  paymentDate: true,
  paymentMethod: true,
  amount: true,
  remark: true,
  _count: { select: { attachments: true } },
  attachments: { select: { id: true } },
} as const

export const receivableInclude = {
  _count: { select: { receipts: true, receiptAllocations: true } },
  invoice: {
    select: { id: true, invoiceCode: true, invoiceType: true, description: true, status: true },
  },
  contract: { select: { id: true, contractCode: true } },
  customer: { select: { id: true, customerCode: true, name: true } },
  depositRefund: { select: { id: true, refundCode: true } },
  ...auditUserInclude,
} as const

/** 详情 / 写回后返回：附带下属收据摘要（勿 as const：Prisma orderBy 需可变数组） */
export const receivableDetailInclude: Prisma.ReceivableInclude = {
  _count: { select: { receipts: true, receiptAllocations: true } },
  invoice: {
    select: { id: true, invoiceCode: true, invoiceType: true, description: true, status: true },
  },
  contract: { select: { id: true, contractCode: true } },
  customer: { select: { id: true, customerCode: true, name: true } },
  depositRefund: { select: { id: true, refundCode: true } },
  ...auditUserInclude,
  receiptAllocations: {
    select: {
      id: true,
      amount: true,
      receipt: { select: receiptSummarySelect },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
  receipts: {
    select: receiptSummarySelect,
    orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
  },
}

export function toReceivableDto(
  row: ReceivableWithRelations,
  bookingDepositApplies: ReceivableBookingDepositApplyDto[] = [],
) {
  // 优先分摊金额；无分摊时回退头表关联（兼容未回填旧数据）
  const fromAlloc = (row.receiptAllocations ?? [])
    .filter(
      (a): a is ReceivableAllocationSummary & { receipt: ReceivableReceiptSummary } =>
        !!a.receipt &&
        (a.receipt.paymentMethod || '') !== BOOKING_DEPOSIT_OFFSET_METHOD,
    )
    .map((a) => ({
      id: a.receipt.id,
      receiptCode: a.receipt.receiptCode,
      paymentDate: dateOnly(a.receipt.paymentDate),
      paymentMethod: a.receipt.paymentMethod || '',
      amount: decimalToNumber(a.amount),
      remark: a.receipt.remark || '',
      attachmentCount:
        a.receipt._count?.attachments ?? a.receipt.attachments?.length ?? 0,
    }))
  const allocIds = new Set(fromAlloc.map((r) => r.id))
  const fromLegacy = (row.receipts ?? [])
    .filter(
      (r) =>
        (r.paymentMethod || '') !== BOOKING_DEPOSIT_OFFSET_METHOD && !allocIds.has(r.id),
    )
    .map((r) => ({
      id: r.id,
      receiptCode: r.receiptCode,
      paymentDate: dateOnly(r.paymentDate),
      paymentMethod: r.paymentMethod || '',
      amount: decimalToNumber(r.amount),
      remark: r.remark || '',
      attachmentCount: r._count?.attachments ?? r.attachments?.length ?? 0,
    }))
  const receipts = [...fromAlloc, ...fromLegacy]
  const receiptCount =
    row._count?.receiptAllocations ??
    row._count?.receipts ??
    receipts.length
  return {
    id: row.id,
    receivableCode: row.receivableCode,
    invoiceId: row.invoiceId,
    invoiceCode: row.invoice?.invoiceCode ?? '',
    invoiceType: row.invoice?.invoiceType ?? '',
    invoiceDescription: row.invoice?.description ?? '',
    /** 所属发票状态（已取消 → 失效应收） */
    invoiceStatus: row.invoice?.status ?? '',
    contractId: row.contractId,
    contractCode: row.contract?.contractCode ?? '',
    customerId: row.customerId,
    customerCode: row.customer?.customerCode ?? '',
    customerName: row.customer?.name ?? '',
    invoiceDate: dateOnly(row.invoiceDate),
    paymentDueDate: dateOnly(row.paymentDueDate),
    invoiceAmount: decimalToNumber(row.invoiceAmount),
    receivedAmount: decimalToNumber(row.receivedAmount),
    refundedAmount: decimalToNumber(row.refundedAmount),
    receivableAmount: decimalToNumber(row.receivableAmount),
    remark: row.remark,
    relatedReceiptRef: row.relatedReceiptRef,
    depositRefundId: row.depositRefundId,
    depositRefundCode: row.depositRefund?.refundCode ?? '',
    receiptCount,
    receipts,
    bookingDepositApplies,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
