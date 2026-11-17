import type { CashFlowRecord } from '@/types/cash-flow'

export const CASH_FLOW_IO_FIELD_KEYS = [
  'flowCode',
  'direction',
  'amount',
  'flowDate',
  'paymentMethod',
  'sourceType',
  'sourceRef',
  'contractCode',
  'customerName',
  'remark',
  'createdBy',
  'createdAt',
] as const

export type CashFlowIoFieldKey = (typeof CASH_FLOW_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: CashFlowIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt') return t(`common.${key}`)
  if (key === 'remark') return t('common.remark')
  return t(`cashFlow.fields.${key}`)
}

const HEADER_ALIASES: Record<CashFlowIoFieldKey, string[]> = {
  flowCode: ['流水編號', '流水编号'],
  direction: ['收支', '方向'],
  amount: ['金額', '金额'],
  flowDate: ['發生日期', '发生日期'],
  paymentMethod: ['付款方式'],
  sourceType: ['來源類型', '来源类型'],
  sourceRef: ['來源單據', '来源单据'],
  contractCode: ['合約編號', '合约编号'],
  customerName: ['客戶', '客户', '客戶名稱', '客户名称'],
  remark: ['備註', '备注'],
  createdBy: ['創建人', '创建人', 'Created By'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
}

function sourceRefOf(row: CashFlowRecord): string {
  return row.receiptCode || row.refundOrderCode || ''
}

export function cashFlowToIoRow(
  row: CashFlowRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: CashFlowIoFieldKey) => fieldHeader(key, t)
  return {
    [h('flowCode')]: row.flowCode,
    [h('direction')]: row.direction || '',
    [h('amount')]: row.amount ?? '',
    [h('flowDate')]: row.flowDate || '',
    [h('paymentMethod')]: row.paymentMethod || '',
    [h('sourceType')]: row.sourceType || '',
    [h('sourceRef')]: sourceRefOf(row),
    [h('contractCode')]: row.contractCode || '',
    [h('customerName')]: row.customerName || '',
    [h('remark')]: row.remark || '',
    [h('createdBy')]: row.createdBy || '',
    [h('createdAt')]: row.createdAt || '',
  }
}

export function cashFlowIoTemplateExampleRow(
  t: Translate,
): Record<string, string | number> {
  const h = (key: CashFlowIoFieldKey) => fieldHeader(key, t)
  return {
    [h('flowCode')]: '',
    [h('direction')]: 'out',
    [h('amount')]: 1000,
    [h('flowDate')]: '2026-09-20',
    [h('paymentMethod')]: '轉賬',
    [h('sourceType')]: 'refund_order',
    [h('sourceRef')]: 'RFO2609200001',
    [h('contractCode')]: '',
    [h('customerName')]: '',
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

export function pickCashFlowIoValue(
  row: Record<string, unknown>,
  key: CashFlowIoFieldKey,
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

export type CashFlowImportPayload = {
  flowCode?: string
  direction?: string
  amount?: number
  flowDate?: string
  paymentMethod?: string
  sourceType?: string
  sourceRef?: string
  remark?: string
}

export function rowToCashFlowIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): CashFlowImportPayload | null {
  const sourceType = pickCashFlowIoValue(row, 'sourceType', t)
  const sourceRef = pickCashFlowIoValue(row, 'sourceRef', t)
  const amountRaw = pickCashFlowIoValue(row, 'amount', t)
  const flowDate = normalizeDateCell(pickCashFlowIoValue(row, 'flowDate', t))
  if (!sourceType || !sourceRef || !amountRaw || !flowDate) return null
  return {
    flowCode: pickCashFlowIoValue(row, 'flowCode', t) || undefined,
    direction: pickCashFlowIoValue(row, 'direction', t) || undefined,
    amount: Number(amountRaw) || 0,
    flowDate,
    paymentMethod: pickCashFlowIoValue(row, 'paymentMethod', t) || undefined,
    sourceType,
    sourceRef,
    remark: pickCashFlowIoValue(row, 'remark', t) || undefined,
  }
}
