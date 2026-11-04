import type { ReceiptRecord } from '@/types/receipt'

export const RECEIPT_IO_FIELD_KEYS = [
  'receiptCode',
  'customerCode',
  'customerName',
  'contractCode',
  'invoiceCode',
  'receivableCode',
  'paymentDate',
  'paymentMethod',
  'amount',
  'remark',
  'changeLog',
  'createdBy',
  'createdAt',
] as const

export type ReceiptIoFieldKey = (typeof RECEIPT_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: ReceiptIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt') return t(`common.${key}`)
  return t(`receipt.fields.${key}`)
}

const HEADER_ALIASES: Record<ReceiptIoFieldKey, string[]> = {
  receiptCode: ['收據編號', '收据编号'],
  customerCode: ['客戶編號', '客户编号'],
  customerName: ['客戶名稱', '客户名称', '客戶', '客户'],
  contractCode: ['合約編號', '合约编号', '所屬合約', '所属合约'],
  invoiceCode: ['所屬發票', '所属发票', '發票編號', '发票编号'],
  receivableCode: ['所屬應收', '所属应收', '應收編號', '应收编号'],
  paymentDate: ['收款日期'],
  paymentMethod: ['收款方式'],
  amount: ['收款金額', '收款金额', '金額', '金额'],
  remark: ['備註', '备注'],
  changeLog: ['修改記錄', '修改记录'],
  createdBy: ['創建人', '创建人', 'Created By'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
}

export function receiptToIoRow(
  row: ReceiptRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: ReceiptIoFieldKey) => fieldHeader(key, t)
  return {
    [h('receiptCode')]: row.receiptCode,
    [h('customerCode')]: row.customerCode || '',
    [h('customerName')]: row.customerName || '',
    [h('contractCode')]: row.contractCode || '',
    [h('invoiceCode')]: row.invoiceCode || '',
    [h('receivableCode')]: row.receivableCode || '',
    [h('paymentDate')]: row.paymentDate || '',
    [h('paymentMethod')]: row.paymentMethod || '',
    [h('amount')]: row.amount ?? '',
    [h('remark')]: row.remark || '',
    [h('changeLog')]: row.changeLog || '',
    [h('createdBy')]: row.createdBy || '',
    [h('createdAt')]: row.createdAt || '',
  }
}

export function receiptIoTemplateExampleRow(
  t: Translate,
): Record<string, string | number> {
  const h = (key: ReceiptIoFieldKey) => fieldHeader(key, t)
  return {
    [h('receiptCode')]: '',
    [h('customerCode')]: 'CM2609110001',
    [h('customerName')]: '',
    [h('contractCode')]: '',
    [h('invoiceCode')]: '',
    [h('receivableCode')]: '',
    [h('paymentDate')]: '2026-09-16',
    [h('paymentMethod')]: '轉數快',
    [h('amount')]: 10000,
    [h('remark')]: '',
    [h('changeLog')]: '',
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

export function pickReceiptIoValue(
  row: Record<string, unknown>,
  key: ReceiptIoFieldKey,
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

export type ReceiptImportPayload = {
  receiptCode?: string
  customerCode?: string
  customerName?: string
  contractCode?: string
  invoiceCode?: string
  receivableCode?: string
  paymentDate?: string
  paymentMethod?: string
  amount?: number
  remark?: string
  changeLog?: string
}

export function rowToReceiptIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): ReceiptImportPayload | null {
  const customerCode = pickReceiptIoValue(row, 'customerCode', t)
  const customerName = pickReceiptIoValue(row, 'customerName', t)
  const invoiceCode = pickReceiptIoValue(row, 'invoiceCode', t)
  const receivableCode = pickReceiptIoValue(row, 'receivableCode', t)
  const contractCode = pickReceiptIoValue(row, 'contractCode', t)
  if (!customerCode && !customerName && !invoiceCode && !receivableCode && !contractCode) {
    return null
  }

  const amountRaw = pickReceiptIoValue(row, 'amount', t)

  return {
    receiptCode: pickReceiptIoValue(row, 'receiptCode', t) || undefined,
    customerCode: customerCode || undefined,
    customerName: customerName || undefined,
    contractCode: contractCode || undefined,
    invoiceCode: invoiceCode || undefined,
    receivableCode: receivableCode || undefined,
    paymentDate: normalizeDateCell(pickReceiptIoValue(row, 'paymentDate', t)) || undefined,
    paymentMethod: pickReceiptIoValue(row, 'paymentMethod', t) || undefined,
    amount: amountRaw !== '' ? Number(amountRaw) || 0 : undefined,
    remark: pickReceiptIoValue(row, 'remark', t) || undefined,
    changeLog: pickReceiptIoValue(row, 'changeLog', t) || undefined,
  }
}
