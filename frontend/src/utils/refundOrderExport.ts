import type { RefundOrderRecord } from '@/types/refund-order'

export const REFUND_ORDER_IO_FIELD_KEYS = [
  'refundCode',
  'status',
  'contractCode',
  'customerName',
  'roomCode',
  'settlementCode',
  'amount',
  'paidAmount',
  'remainingAmount',
  'refundDate',
  'paymentMethod',
  'handler',
  'remark',
  'createdBy',
  'createdAt',
] as const

export type RefundOrderIoFieldKey = (typeof REFUND_ORDER_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: RefundOrderIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt') return t(`common.${key}`)
  if (key === 'remark') return t('common.remark')
  return t(`refundOrder.fields.${key}`)
}

const HEADER_ALIASES: Record<RefundOrderIoFieldKey, string[]> = {
  refundCode: ['退款編號', '退款编号'],
  status: ['狀態', '状态'],
  contractCode: ['合約編號', '合约编号'],
  customerName: ['客戶', '客户', '客戶名稱', '客户名称'],
  roomCode: ['房間', '房间', '房間編號', '房间编号'],
  settlementCode: ['合約終止結算單', '合约终止结算单', '終止結算編號', '终止结算编号', '結算編號', '结算编号'],
  amount: ['應退金額', '应退金额'],
  paidAmount: ['已打金額', '已打金额'],
  remainingAmount: ['待退金額', '待退金额'],
  refundDate: ['打款日期'],
  paymentMethod: ['付款方式'],
  handler: ['經辦人', '经办人'],
  remark: ['備註', '备注'],
  createdBy: ['創建人', '创建人', 'Created By'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
}

export function refundOrderToIoRow(
  row: RefundOrderRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: RefundOrderIoFieldKey) => fieldHeader(key, t)
  return {
    [h('refundCode')]: row.refundCode,
    [h('status')]: row.status || '',
    [h('contractCode')]: row.contractCode || '',
    [h('customerName')]: row.customerName || '',
    [h('roomCode')]: row.roomCode || '',
    [h('settlementCode')]: row.settlementCode || '',
    [h('amount')]: row.amount ?? '',
    [h('paidAmount')]: row.paidAmount ?? '',
    [h('remainingAmount')]: row.remainingAmount ?? '',
    [h('refundDate')]: row.refundDate || '',
    [h('paymentMethod')]: row.paymentMethod || '',
    [h('handler')]: row.handler || '',
    [h('remark')]: row.remark || '',
    [h('createdBy')]: row.createdBy || '',
    [h('createdAt')]: row.createdAt || '',
  }
}

export function refundOrderIoTemplateExampleRow(
  t: Translate,
): Record<string, string | number> {
  const h = (key: RefundOrderIoFieldKey) => fieldHeader(key, t)
  return {
    [h('refundCode')]: '',
    [h('status')]: 'pending',
    [h('contractCode')]: '',
    [h('customerName')]: '',
    [h('roomCode')]: '',
    [h('settlementCode')]: 'STV2609110001',
    [h('amount')]: 5000,
    [h('paidAmount')]: '',
    [h('remainingAmount')]: '',
    [h('refundDate')]: '',
    [h('paymentMethod')]: '',
    [h('handler')]: '',
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

export function pickRefundOrderIoValue(
  row: Record<string, unknown>,
  key: RefundOrderIoFieldKey,
  t: Translate,
): string {
  const headers = [fieldHeader(key, t), ...(HEADER_ALIASES[key] || [])]
  for (const h of headers) {
    if (h in row) return cellStr(row[h])
  }
  const normalized = new Map(Object.keys(row).map((k) => [k.replace(/\s+/g, ''), row[k]]))
  for (const h of headers) {
    const hit = normalized.get(h.replace(/\s+/g, ''))
    if (hit !== undefined) return cellStr(hit)
  }
  return ''
}

export type RefundOrderImportPayload = {
  refundCode?: string
  settlementCode?: string
  amount?: number
  paidAmount?: number
  refundDate?: string
  paymentMethod?: string
  remark?: string
}

export function rowToRefundOrderIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): RefundOrderImportPayload | null {
  const settlementCode = pickRefundOrderIoValue(row, 'settlementCode', t)
  if (!settlementCode) return null
  const amountRaw = pickRefundOrderIoValue(row, 'amount', t)
  const paidRaw = pickRefundOrderIoValue(row, 'paidAmount', t)
  return {
    refundCode: pickRefundOrderIoValue(row, 'refundCode', t) || undefined,
    settlementCode,
    amount: amountRaw !== '' ? Number(amountRaw) || 0 : undefined,
    paidAmount: paidRaw !== '' ? Number(paidRaw) || 0 : undefined,
    refundDate: normalizeDateCell(pickRefundOrderIoValue(row, 'refundDate', t)) || undefined,
    paymentMethod: pickRefundOrderIoValue(row, 'paymentMethod', t) || undefined,
    remark: pickRefundOrderIoValue(row, 'remark', t) || undefined,
  }
}
