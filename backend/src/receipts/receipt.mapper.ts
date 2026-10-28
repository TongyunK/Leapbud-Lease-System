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

export type ReceiptWithRelations = Receipt & {
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null
  contract?: Pick<Contract, 'id' | 'contractCode'> | null
  invoice?: Pick<Invoice, 'id' | 'invoiceCode'> | null
  receivable?: Pick<Receivable, 'id' | 'receivableCode'> | null
  attachments?: ReceiptAttachmentRow[]
  createdByUser?: AuditUserRef | null
  updatedByUser?: AuditUserRef | null
}

export const receiptInclude = {
  customer: { select: { id: true, customerCode: true, name: true } },
  contract: { select: { id: true, contractCode: true } },
  invoice: { select: { id: true, invoiceCode: true } },
  receivable: { select: { id: true, receivableCode: true } },
  attachments: { orderBy: { sortOrder: 'asc' as const } },
  ...auditUserInclude,
} as const

export function toReceiptDto(row: ReceiptWithRelations) {
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
    invoiceCode: row.invoice?.invoiceCode ?? '',
    receivableId: row.receivableId,
    receivableCode: row.receivable?.receivableCode ?? '',
    paymentDate: dateOnly(row.paymentDate),
    paymentMethod: row.paymentMethod,
    amount: decimalToNumber(row.amount),
    remark: row.remark,
    attachments: (row.attachments ?? []).map(toReceiptAttachmentDto),
    changeLog: row.changeLog,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
