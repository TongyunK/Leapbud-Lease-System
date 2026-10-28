import type {
  Contract,
  Customer,
  Invoice,
  InvoiceServiceDetail,
  Room,
  User,
} from '@prisma/client'
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

type SalesManagerLite = Pick<User, 'id' | 'account' | 'displayName'>

export type InvoiceServiceDetailRow = InvoiceServiceDetail & {
  createdByUser?: AuditUserRef | null
}

export type InvoiceWithRelations = Invoice & {
  _count?: {
    receivables: number
    receipts: number
    serviceDetails: number
  }
  contract?: Pick<Contract, 'id' | 'contractCode'> | null
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null
  room?: Pick<Room, 'id' | 'roomCode' | 'name'> | null
  salesManagerUser?: SalesManagerLite | null
  serviceDetails?: InvoiceServiceDetailRow[]
  createdByUser?: AuditUserRef | null
  updatedByUser?: AuditUserRef | null
}

export const invoiceInclude = {
  _count: {
    select: {
      receivables: true,
      receipts: true,
      serviceDetails: true,
    },
  },
  contract: { select: { id: true, contractCode: true } },
  customer: { select: { id: true, customerCode: true, name: true } },
  room: { select: { id: true, roomCode: true, name: true } },
  salesManagerUser: { select: { id: true, account: true, displayName: true } },
  serviceDetails: {
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ] as Prisma.InvoiceServiceDetailOrderByWithRelationInput[],
    include: {
      createdByUser: auditUserInclude.createdByUser,
    },
  },
  ...auditUserInclude,
} as const

function salesManagerLabel(u?: SalesManagerLite | null) {
  if (!u) return ''
  return (u.displayName || '').trim() || u.account
}

export function toInvoiceServiceDetailDto(row: InvoiceServiceDetailRow) {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    description: row.description,
    quantity: decimalToNumber(row.quantity),
    unitAmount: decimalToNumber(row.unitAmount),
    subtotal: decimalToNumber(row.subtotal),
    remark: row.remark,
    sortOrder: row.sortOrder,
    createdBy: auditActorLabel(row.createdByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function toInvoiceDto(row: InvoiceWithRelations) {
  return {
    id: row.id,
    invoiceCode: row.invoiceCode ?? '',
    contractId: row.contractId,
    contractCode: row.contract?.contractCode ?? '',
    customerId: row.customerId,
    customerCode: row.customer?.customerCode ?? '',
    customerName: row.customer?.name ?? '',
    roomId: row.roomId,
    roomCode: row.room?.roomCode ?? '',
    roomName: row.room?.name ?? '',
    invoiceType: row.invoiceType,
    billingKind: row.billingKind,
    periodStart: dateOnly(row.periodStart),
    periodEnd: dateOnly(row.periodEnd),
    description: row.description,
    amount: decimalToNumber(row.amount),
    status: row.status,
    invoiceDate: dateOnly(row.invoiceDate),
    paymentDueDate: dateOnly(row.paymentDueDate),
    salesManagerId: row.salesManagerId,
    salesManager: salesManagerLabel(row.salesManagerUser),
    relatedReceivableRef: row.relatedReceivableRef,
    attachment: row.attachment,
    roomNameText: row.roomNameText,
    notes: row.notes,
    whatsappNumber: row.whatsappNumber,
    shortTermRentalCode: row.shortTermRentalCode,
    remark: row.remark,
    serviceDetails: (row.serviceDetails ?? []).map(toInvoiceServiceDetailDto),
    receivableCount: row._count?.receivables ?? 0,
    receiptCount: row._count?.receipts ?? 0,
    serviceDetailCount: row._count?.serviceDetails ?? row.serviceDetails?.length ?? 0,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
