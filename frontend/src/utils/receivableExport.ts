import type { ReceivableRecord } from '@/types/receivable'

export const RECEIVABLE_IO_FIELD_KEYS = [
  'receivableCode',
  'invoiceCode',
  'contractCode',
  'customerName',
  'invoiceDate',
  'paymentDueDate',
  'invoiceAmount',
  'receivedAmount',
  'receivableAmount',
  'relatedReceiptRef',
  'depositRefundCode',
  'remark',
  'createdBy',
  'createdAt',
] as const

export type ReceivableIoFieldKey = (typeof RECEIVABLE_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: ReceivableIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt') return t(`common.${key}`)
  return t(`receivable.fields.${key}`)
}

const HEADER_ALIASES: Record<ReceivableIoFieldKey, string[]> = {
  receivableCode: ['應收編號', '应收编号'],
  invoiceCode: ['所屬發票', '所属发票', '發票編號', '发票编号'],
  contractCode: ['合約編號', '合约编号', '合約單編號', '合约单编号'],
  customerName: ['客戶', '客户', '客戶名稱', '客户名称'],
  invoiceDate: ['發票日期', '发票日期'],
  paymentDueDate: ['收款期限'],
  invoiceAmount: ['開票金額', '开票金额'],
  receivedAmount: ['已收金額', '已收金额'],
  receivableAmount: ['應收金額', '应收金额'],
  relatedReceiptRef: ['收款記錄', '收款记录'],
  depositRefundCode: ['按金退還編號', '按金退还编号', '按金退還記錄', '按金退还记录'],
  remark: ['備註', '备注'],
  createdBy: ['創建人', '创建人', 'Created By'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
}

export function receivableToIoRow(
  row: ReceivableRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: ReceivableIoFieldKey) => fieldHeader(key, t)
  return {
    [h('receivableCode')]: row.receivableCode,
    [h('invoiceCode')]: row.invoiceCode,
    [h('contractCode')]: row.contractCode,
    [h('customerName')]: row.customerName || '',
    [h('invoiceDate')]: row.invoiceDate || '',
    [h('paymentDueDate')]: row.paymentDueDate || '',
    [h('invoiceAmount')]: row.invoiceAmount ?? '',
    [h('receivedAmount')]: row.receivedAmount ?? '',
    [h('receivableAmount')]: row.receivableAmount ?? '',
    [h('relatedReceiptRef')]: row.relatedReceiptRef || '',
    [h('depositRefundCode')]: row.depositRefundCode || '',
    [h('remark')]: row.remark || '',
    [h('createdBy')]: row.createdBy || '',
    [h('createdAt')]: row.createdAt || '',
  }
}

export function receivableIoTemplateExampleRow(
  t: Translate,
): Record<string, string | number> {
  const h = (key: ReceivableIoFieldKey) => fieldHeader(key, t)
  return {
    [h('receivableCode')]: '',
    [h('invoiceCode')]: 'INV2609110001',
    [h('contractCode')]: '',
    [h('customerName')]: '',
    [h('invoiceDate')]: '2026-09-11',
    [h('paymentDueDate')]: '2026-09-25',
    [h('invoiceAmount')]: 10000,
    [h('receivedAmount')]: 0,
    [h('receivableAmount')]: 10000,
    [h('relatedReceiptRef')]: '',
    [h('depositRefundCode')]: '',
    [h('remark')]: '',
    [h('createdBy')]: '',
    [h('createdAt')]: '',
  }
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return String(v).trim()
}

function normalizeDateCell(v: unknown): string {
  const raw = cellStr(v)
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const n = Number(raw)
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const epoch = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000
    const d = new Date(epoch)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return raw
}

export function pickReceivableIoValue(
  row: Record<string, unknown>,
  key: ReceivableIoFieldKey,
  t: Translate,
): string {
  const headers = [fieldHeader(key, t), ...(HEADER_ALIASES[key] || [])]
  for (const h of headers) {
    if (h in row) return cellStr(row[h])
  }
  const normalized = new Map(
    Object.keys(row).map((k) => [k.replace(/\s+/g, ''), row[k]]),
  )
  for (const h of headers) {
    const hit = normalized.get(h.replace(/\s+/g, ''))
    if (hit !== undefined) return cellStr(hit)
  }
  return ''
}

export type ReceivableImportPayload = {
  invoiceCode?: string
  receivableCode?: string
  contractCode?: string
  invoiceDate?: string
  paymentDueDate?: string
  invoiceAmount?: number
  receivedAmount?: number
  receivableAmount?: number
  relatedReceiptRef?: string
  depositRefundCode?: string
  remark?: string
}

export function rowToReceivableIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): ReceivableImportPayload | null {
  const invoiceCode = pickReceivableIoValue(row, 'invoiceCode', t)
  if (!invoiceCode) return null

  const invAmtRaw = pickReceivableIoValue(row, 'invoiceAmount', t)
  const recvRaw = pickReceivableIoValue(row, 'receivedAmount', t)
  const arRaw = pickReceivableIoValue(row, 'receivableAmount', t)

  return {
    invoiceCode,
    receivableCode: pickReceivableIoValue(row, 'receivableCode', t) || undefined,
    contractCode: pickReceivableIoValue(row, 'contractCode', t) || undefined,
    invoiceDate: normalizeDateCell(pickReceivableIoValue(row, 'invoiceDate', t)) || undefined,
    paymentDueDate:
      normalizeDateCell(pickReceivableIoValue(row, 'paymentDueDate', t)) || undefined,
    invoiceAmount: invAmtRaw !== '' ? Number(invAmtRaw) || 0 : undefined,
    receivedAmount: recvRaw !== '' ? Number(recvRaw) || 0 : undefined,
    receivableAmount: arRaw !== '' ? Number(arRaw) || 0 : undefined,
    relatedReceiptRef: pickReceivableIoValue(row, 'relatedReceiptRef', t) || undefined,
    depositRefundCode: pickReceivableIoValue(row, 'depositRefundCode', t) || undefined,
    remark: pickReceivableIoValue(row, 'remark', t) || undefined,
  }
}
