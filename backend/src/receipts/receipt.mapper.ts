import type { Contract, Customer, Invoice, Receipt, ReceiptAttachment, Receivable } from '@prisma/client'
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

/** 收据附件行（与 Prisma ReceiptAttachment 对齐） */
export type ReceiptAttachmentRow = Pick<
  ReceiptAttachment,
  'id' | 'receiptId' | 'fileName' | 'storageKey' | 'sortOrder'
>

/** 真正外部地址（无本地文件） */
export function isExternalReceiptAttachmentKey(storageKey: string): boolean {
  const key = (storageKey || '').trim()
  return /^https?:\/\//i.test(key)
}

/** 去掉前导 /，得到相对 uploads 根的路径 */
export function receiptAttachmentStorageRel(storageKey: string): string {
  return (storageKey || '').trim().replace(/^\/+/, '')
}

/**
 * 浏览器可直链的附件 URL（由入口 Nginx /files/ 静态提供）。
 * 相对键 receipts/... 或 attachments/... → /files/...
 */
export function receiptAttachmentPublicUrl(storageKey: string): string | undefined {
  const key = (storageKey || '').trim()
  if (!key) return undefined
  if (/^https?:\/\//i.test(key)) return key
  const rel = receiptAttachmentStorageRel(key)
  if (!rel || rel.includes('..')) return undefined
  return `/files/${rel}`
}

export function toReceiptAttachmentDto(row: ReceiptAttachmentRow) {
  const storageKey = row.storageKey ?? ''
  return {
    id: row.id,
    receiptId: row.receiptId,
    fileName: row.fileName,
    sortOrder: row.sortOrder,
    publicUrl: receiptAttachmentPublicUrl(storageKey),
  }
}

export type ReceiptAllocationRow = {
  id: string
  receiptId: string
  receivableId: string
  invoiceId: string | null
  amount: Prisma.Decimal | number
  sortOrder: number
  remark: string
  receivable?:
    | (Pick<Receivable, 'id' | 'receivableCode' | 'invoiceId'> & {
        invoice?: Pick<Invoice, 'id' | 'invoiceCode'> | null
      })
    | null
}

export type ReceiptWithRelations = Receipt & {
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null
  contract?: Pick<Contract, 'id' | 'contractCode'> | null
  invoice?: Pick<Invoice, 'id' | 'invoiceCode'> | null
  receivable?: Pick<Receivable, 'id' | 'receivableCode'> | null
  allocations?: ReceiptAllocationRow[]
  attachments?: ReceiptAttachmentRow[]
  createdByUser?: AuditUserRef | null
  updatedByUser?: AuditUserRef | null
  _count?: { cashFlows: number }
}

export const receiptAllocationInclude = {
  receivable: {
    select: {
      id: true,
      receivableCode: true,
      invoiceId: true,
      invoice: { select: { id: true, invoiceCode: true } },
    },
  },
} as const

/** 勿整体 as const：allocations.orderBy 需可变数组以兼容 Prisma Include */
export const receiptInclude: Prisma.ReceiptInclude = {
  customer: { select: { id: true, customerCode: true, name: true } },
  contract: { select: { id: true, contractCode: true } },
  invoice: { select: { id: true, invoiceCode: true } },
  receivable: { select: { id: true, receivableCode: true } },
  allocations: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: receiptAllocationInclude,
  },
  attachments: { orderBy: { sortOrder: 'asc' } },
  _count: { select: { cashFlows: true } },
  ...auditUserInclude,
}

function joinUniqueCodes(codes: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of codes) {
    const c = (raw || '').trim()
    if (!c || seen.has(c)) continue
    seen.add(c)
    out.push(c)
  }
  return out.join(', ')
}

export function toReceiptAllocationDto(row: ReceiptAllocationRow) {
  const invoiceId = row.invoiceId || row.receivable?.invoiceId || null
  const invoiceCode = row.receivable?.invoice?.invoiceCode ?? ''
  return {
    id: row.id,
    receiptId: row.receiptId,
    receivableId: row.receivableId,
    receivableCode: row.receivable?.receivableCode ?? '',
    invoiceId,
    invoiceCode,
    amount: decimalToNumber(row.amount),
    sortOrder: row.sortOrder,
    remark: row.remark || '',
  }
}

export function toReceiptDto(row: ReceiptWithRelations) {
  const allocations = (row.allocations ?? []).map(toReceiptAllocationDto)
  const invoiceCodeFromAlloc = joinUniqueCodes(allocations.map((a) => a.invoiceCode))
  const receivableCodeFromAlloc = joinUniqueCodes(allocations.map((a) => a.receivableCode))
  const headerInvoiceCode = row.invoice?.invoiceCode ?? ''
  const headerReceivableCode = row.receivable?.receivableCode ?? ''
  return {
    id: row.id,
    receiptCode: row.receiptCode,
    kind: row.kind,
    customerId: row.customerId,
    customerCode: row.customer?.customerCode ?? '',
    customerName: row.customer?.name ?? '',
    contractId: row.contractId,
    contractCode: row.contract?.contractCode ?? '',
    invoiceId: row.invoiceId,
    invoiceCode: invoiceCodeFromAlloc || headerInvoiceCode,
    receivableId: row.receivableId,
    receivableCode: receivableCodeFromAlloc || headerReceivableCode,
    paymentDate: dateOnly(row.paymentDate),
    paymentMethod: row.paymentMethod,
    amount: decimalToNumber(row.amount),
    remark: row.remark,
    allocations,
    attachments: (row.attachments ?? []).map(toReceiptAttachmentDto),
    cashFlowCount: row._count?.cashFlows ?? 0,
    changeLog: row.changeLog,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
