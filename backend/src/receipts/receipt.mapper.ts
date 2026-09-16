import type { Contract, Customer, Invoice, Receipt, Receivable } from '@prisma/client'
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

export type ReceiptWithRelations = Receipt & {
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null
  contract?: Pick<Contract, 'id' | 'contractCode'> | null
  invoice?: Pick<Invoice, 'id' | 'invoiceCode'> | null
  receivable?: Pick<Receivable, 'id' | 'receivableCode'> | null
  createdByUser?: AuditUserRef | null
  updatedByUser?: AuditUserRef | null
}

export const receiptInclude = {
  customer: { select: { id: true, customerCode: true, name: true } },
  contract: { select: { id: true, contractCode: true } },
  invoice: { select: { id: true, invoiceCode: true } },
  receivable: { select: { id: true, receivableCode: true } },
  ...auditUserInclude,
} as const

export function toReceiptDto(row: ReceiptWithRelations) {
  return {
    id: row.id,
    receiptCode: row.receiptCode,
    customerId: row.customerId,
    customerCode: row.customer?.customerCode ?? '',
    customerName: row.customer?.name ?? '',
    contractId: row.contractId,
    contractCode: row.contract?.contractCode ?? '',
    invoiceId: row.invoiceId,
    invoiceCode: row.invoice?.invoiceCode ?? '',
    receivableId: row.receivableId,
    receivableCode: row.receivable?.receivableCode ?? '',
    paymentDate: dateOnly(row.paymentDate),
    paymentMethod: row.paymentMethod,
    amount: decimalToNumber(row.amount),
    remark: row.remark,
    voucher1: row.voucher1,
    voucher2: row.voucher2,
    changeLog: row.changeLog,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
