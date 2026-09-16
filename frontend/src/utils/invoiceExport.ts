import type { InvoiceRecord } from '@/types/invoice'

export const INVOICE_IO_FIELD_KEYS = [
  'invoiceCode',
  'contractCode',
  'customerName',
  'roomCode',
  'roomName',
  'roomNameText',
  'invoiceType',
  'description',
  'amount',
  'status',
  'invoiceDate',
  'paymentDueDate',
  'salesManager',
  'relatedReceivableRef',
  'attachment',
  'notes',
  'whatsappNumber',
  'shortTermRentalCode',
  'remark',
  'createdBy',
  'createdAt',
] as const

export type InvoiceIoFieldKey = (typeof INVOICE_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: InvoiceIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt') return t(`common.${key}`)
  return t(`invoice.fields.${key}`)
}

const HEADER_ALIASES: Record<InvoiceIoFieldKey, string[]> = {
  invoiceCode: ['發票編號', '发票编号'],
  contractCode: ['合約編號', '合约编号', '合約單編號', '合约单编号'],
  customerName: ['客戶名稱', '客户名称'],
  roomCode: ['房間編號', '房间编号'],
  roomName: ['房間名稱', '房间名称'],
  roomNameText: ['房間名稱文本', '房间名称文本', '房間名稱快照', '房间名称快照'],
  invoiceType: ['發票類型', '发票类型'],
  description: ['發票描述', '发票描述'],
  amount: ['開票金額', '开票金额'],
  status: ['狀態', '状态'],
  invoiceDate: ['發票日期', '发票日期'],
  paymentDueDate: ['收款期限'],
  salesManager: ['銷售經理', '销售经理'],
  relatedReceivableRef: ['應收帳', '应收帐', '應收帳款', '应收帐款'],
  attachment: ['開票附件', '开票附件'],
  notes: ['備注', '备注说明'],
  whatsappNumber: ['Whatsapp號碼', 'WhatsApp號碼', 'WhatsApp号码', 'Whatsapp号码'],
  shortTermRentalCode: ['短租編號', '短租编号'],
  remark: ['備註', '备注'],
  createdBy: ['創建人', '创建人', 'Created By'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
}

export function invoiceToIoRow(
  row: InvoiceRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: InvoiceIoFieldKey) => fieldHeader(key, t)
  return {
    [h('invoiceCode')]: row.invoiceCode,
    [h('contractCode')]: row.contractCode,
    [h('customerName')]: row.customerName || '',
    [h('roomCode')]: row.roomCode || '',
    [h('roomName')]: row.roomName || '',
    [h('roomNameText')]: row.roomNameText || '',
    [h('invoiceType')]: row.invoiceType || '',
    [h('description')]: row.description || '',
    [h('amount')]: row.amount ?? '',
    [h('status')]: row.status || '',
    [h('invoiceDate')]: row.invoiceDate || '',
    [h('paymentDueDate')]: row.paymentDueDate || '',
    [h('salesManager')]: row.salesManager || '',
    [h('relatedReceivableRef')]: row.relatedReceivableRef || '',
    [h('attachment')]: row.attachment || '',
    [h('notes')]: row.notes || '',
    [h('whatsappNumber')]: row.whatsappNumber || '',
    [h('shortTermRentalCode')]: row.shortTermRentalCode || '',
    [h('remark')]: row.remark || '',
    [h('createdBy')]: row.createdBy || '',
    [h('createdAt')]: row.createdAt || '',
  }
}

export function invoiceIoTemplateExampleRow(
  t: Translate,
): Record<string, string | number> {
  const h = (key: InvoiceIoFieldKey) => fieldHeader(key, t)
  return {
    [h('invoiceCode')]: '',
    [h('contractCode')]: 'CTR2609110001',
    [h('customerName')]: '',
    [h('roomCode')]: '',
    [h('roomName')]: '',
    [h('roomNameText')]: '',
    [h('invoiceType')]: 'Deposit',
    [h('description')]: '月租發票',
    [h('amount')]: 12000,
    [h('status')]: '待開票',
    [h('invoiceDate')]: '2026-09-16',
    [h('paymentDueDate')]: '2026-09-30',
    [h('salesManager')]: '',
    [h('relatedReceivableRef')]: '',
    [h('attachment')]: '',
    [h('notes')]: '',
    [h('whatsappNumber')]: '',
    [h('shortTermRentalCode')]: '',
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

export function pickInvoiceIoValue(
  row: Record<string, unknown>,
  key: InvoiceIoFieldKey,
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

export type InvoiceImportPayload = {
  contractCode?: string
  invoiceCode?: string
  invoiceType?: string
  description?: string
  amount?: number
  status?: string
  invoiceDate?: string
  paymentDueDate?: string
  relatedReceivableRef?: string
  attachment?: string
  roomNameText?: string
  notes?: string
  whatsappNumber?: string
  shortTermRentalCode?: string
  remark?: string
}

export function rowToInvoiceIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): InvoiceImportPayload | null {
  const contractCode = pickInvoiceIoValue(row, 'contractCode', t)
  if (!contractCode) return null

  const amountRaw = pickInvoiceIoValue(row, 'amount', t)

  return {
    contractCode,
    invoiceCode: pickInvoiceIoValue(row, 'invoiceCode', t) || undefined,
    invoiceType: pickInvoiceIoValue(row, 'invoiceType', t) || undefined,
    description: pickInvoiceIoValue(row, 'description', t) || undefined,
    amount: amountRaw !== '' ? Number(amountRaw) || 0 : undefined,
    status: pickInvoiceIoValue(row, 'status', t) || undefined,
    invoiceDate: normalizeDateCell(pickInvoiceIoValue(row, 'invoiceDate', t)) || undefined,
    paymentDueDate:
      normalizeDateCell(pickInvoiceIoValue(row, 'paymentDueDate', t)) || undefined,
    relatedReceivableRef: pickInvoiceIoValue(row, 'relatedReceivableRef', t) || undefined,
    attachment: pickInvoiceIoValue(row, 'attachment', t) || undefined,
    roomNameText: pickInvoiceIoValue(row, 'roomNameText', t) || undefined,
    notes: pickInvoiceIoValue(row, 'notes', t) || undefined,
    whatsappNumber: pickInvoiceIoValue(row, 'whatsappNumber', t) || undefined,
    shortTermRentalCode: pickInvoiceIoValue(row, 'shortTermRentalCode', t) || undefined,
    remark: pickInvoiceIoValue(row, 'remark', t) || undefined,
  }
}
