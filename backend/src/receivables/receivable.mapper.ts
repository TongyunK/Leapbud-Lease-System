import type { Contract, Customer, DepositRefund, Invoice, Receivable } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit'

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

export type ReceivableWithRelations = Receivable & {
  _count?: { receipts: number }
  invoice?: Pick<Invoice, 'id' | 'invoiceCode' | 'invoiceType' | 'description'> | null
  contract?: Pick<Contract, 'id' | 'contractCode'> | null
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null
  depositRefund?: Pick<DepositRefund, 'id' | 'refundCode'> | null
  createdByUser?: AuditUserRef | null
  updatedByUser?: AuditUserRef | null
}

export const receivableInclude = {
  _count: { select: { receipts: true } },
  invoice: { select: { id: true, invoiceCode: true, invoiceType: true, description: true } },
  contract: { select: { id: true, contractCode: true } },
  customer: { select: { id: true, customerCode: true, name: true } },
  depositRefund: { select: { id: true, refundCode: true } },
  ...auditUserInclude,
} as const

export function toReceivableDto(row: ReceivableWithRelations) {
  return {
    id: row.id,
    receivableCode: row.receivableCode,
    invoiceId: row.invoiceId,
    invoiceCode: row.invoice?.invoiceCode ?? '',
    invoiceType: row.invoice?.invoiceType ?? '',
    invoiceDescription: row.invoice?.description ?? '',
    contractId: row.contractId,
    contractCode: row.contract?.contractCode ?? '',
    customerId: row.customerId,
    customerCode: row.customer?.customerCode ?? '',
    customerName: row.customer?.name ?? '',
    invoiceDate: dateOnly(row.invoiceDate),
    paymentDueDate: dateOnly(row.paymentDueDate),
    invoiceAmount: decimalToNumber(row.invoiceAmount),
    receivedAmount: decimalToNumber(row.receivedAmount),
    receivableAmount: decimalToNumber(row.receivableAmount),
    remark: row.remark,
    relatedReceiptRef: row.relatedReceiptRef,
    depositRefundId: row.depositRefundId,
    depositRefundCode: row.depositRefund?.refundCode ?? '',
    receiptCount: row._count?.receipts ?? 0,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
