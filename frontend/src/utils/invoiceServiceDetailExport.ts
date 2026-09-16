import type { InvoiceServiceDetailListRecord } from '@/types/invoice-service-detail'

export const INVOICE_SERVICE_DETAIL_IO_FIELD_KEYS = [
  'invoiceCode',
  'description',
  'quantity',
  'unitAmount',
  'subtotal',
  'remark',
  'sortOrder',
  'createdBy',
  'createdAt',
] as const

export type InvoiceServiceDetailIoFieldKey = (typeof INVOICE_SERVICE_DETAIL_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: InvoiceServiceDetailIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt') return t(`common.${key}`)
  return t(`invoiceServiceDetail.fields.${key}`)
}

const HEADER_ALIASES: Record<InvoiceServiceDetailIoFieldKey, string[]> = {
  invoiceCode: [
    '發票編號',
    '发票编号',
    '所屬發票',
    '所属发票',
    '所属發票',
    '所屬发票',
    '發票',
    '发票',
  ],
  description: ['服務描述', '服务描述', '描述'],
  quantity: ['數量', '数量'],
  unitAmount: ['單價', '单价'],
  subtotal: ['小計', '小计'],
  remark: ['備註', '备注'],
  sortOrder: ['排序', '排序权重', '排序權重'],
  createdBy: ['創建人', '创建人', 'Created By'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
}

export function invoiceServiceDetailToIoRow(
  row: InvoiceServiceDetailListRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: InvoiceServiceDetailIoFieldKey) => fieldHeader(key, t)
  return {
    [h('invoiceCode')]: row.invoiceCode,
    [h('description')]: row.description || '',
    [h('quantity')]: row.quantity ?? '',
    [h('unitAmount')]: row.unitAmount ?? '',
    [h('subtotal')]: row.subtotal ?? '',
    [h('remark')]: row.remark || '',
    [h('sortOrder')]: row.sortOrder,
    [h('createdBy')]: row.createdBy || '',
    [h('createdAt')]: row.createdAt || '',
  }
}

export function invoiceServiceDetailIoTemplateExampleRow(
  t: Translate,
): Record<string, string | number> {
  const h = (key: InvoiceServiceDetailIoFieldKey) => fieldHeader(key, t)
  return {
    [h('invoiceCode')]: 'INV2609110001',
    [h('description')]: '服務費',
    [h('quantity')]: 1,
    [h('unitAmount')]: 1000,
    [h('subtotal')]: 1000,
    [h('remark')]: '',
    [h('sortOrder')]: 0,
    [h('createdBy')]: '',
    [h('createdAt')]: '',
  }
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return String(v).trim()
}

export function pickInvoiceServiceDetailIoValue(
  row: Record<string, unknown>,
  key: InvoiceServiceDetailIoFieldKey,
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

export type InvoiceServiceDetailImportPayload = {
  invoiceCode?: string
  description?: string
  quantity?: number
  unitAmount?: number
  subtotal?: number
  remark?: string
  sortOrder?: number
}

export function rowToInvoiceServiceDetailIoPayload(
  row: Record<string, unknown>,
  t: Translate,
  options?: { fallbackInvoiceCode?: string },
): InvoiceServiceDetailImportPayload | null {
  const invoiceCode =
    pickInvoiceServiceDetailIoValue(row, 'invoiceCode', t) ||
    (options?.fallbackInvoiceCode || '').trim()
  if (!invoiceCode) return null

  const quantityRaw = pickInvoiceServiceDetailIoValue(row, 'quantity', t)
  const unitRaw = pickInvoiceServiceDetailIoValue(row, 'unitAmount', t)
  const subRaw = pickInvoiceServiceDetailIoValue(row, 'subtotal', t)
  const sortRaw = pickInvoiceServiceDetailIoValue(row, 'sortOrder', t)
  const quantity = quantityRaw !== '' ? Number(quantityRaw) || 0 : 0
  const unitAmount = unitRaw !== '' ? Number(unitRaw) || 0 : 0
  const subtotal = subRaw !== '' ? Number(subRaw) || 0 : quantity * unitAmount

  return {
    invoiceCode,
    description: pickInvoiceServiceDetailIoValue(row, 'description', t) || undefined,
    quantity,
    unitAmount,
    subtotal,
    remark: pickInvoiceServiceDetailIoValue(row, 'remark', t) || undefined,
    sortOrder: sortRaw !== '' ? Math.floor(Number(sortRaw) || 0) : undefined,
  }
}
