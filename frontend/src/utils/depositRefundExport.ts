import type { DepositRefundRecord } from '@/types/deposit-refund'

export const DEPOSIT_REFUND_IO_FIELD_KEYS = [
  'refundCode',
  'contractCode',
  'customerName',
  'roomCode',
  'roomName',
  'status',
  'terminationDate',
  'refundDate',
  'totalDeposit',
  'actualRefundAmount',
  'handler',
  'attachments',
  'remark',
  'createdBy',
  'createdAt',
] as const

export type DepositRefundIoFieldKey = (typeof DEPOSIT_REFUND_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: DepositRefundIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt') return t(`common.${key}`)
  return t(`depositRefund.fields.${key}`)
}

const HEADER_ALIASES: Record<DepositRefundIoFieldKey, string[]> = {
  refundCode: ['退還編號', '退还编号'],
  contractCode: ['合約編號', '合约编号'],
  customerName: ['客戶名稱', '客户名称'],
  roomCode: ['房間編號', '房间编号'],
  roomName: ['房間名稱', '房间名称'],
  status: ['狀態', '状态'],
  terminationDate: ['退租日期'],
  refundDate: ['退款日期', '退還日期', '退还日期'],
  totalDeposit: ['按金總額', '按金总额'],
  actualRefundAmount: ['實退按金金額', '实退按金金额', '實退金額', '实退金额'],
  handler: ['處理人', '处理人'],
  attachments: [
    '憑證',
    '凭证',
    '退還憑證',
    '退还凭证',
    '退還憑證圖片',
    '退还凭证图片',
    '退還憑證附件',
    '退还凭证附件',
  ],
  remark: ['備註', '备注'],
  createdBy: ['創建人', '创建人', 'Created By'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
}

function attachmentsCell(row: DepositRefundRecord): string {
  const names = (row.attachments || []).map((a) => a.fileName).filter(Boolean)
  if (names.length) return names.join('; ')
  const legacy = [row.voucherImage, row.voucherAttachment]
    .map((s) => (s || '').trim())
    .filter(Boolean)
  return legacy.join('; ')
}

export function depositRefundToIoRow(
  row: DepositRefundRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: DepositRefundIoFieldKey) => fieldHeader(key, t)
  return {
    [h('refundCode')]: row.refundCode,
    [h('contractCode')]: row.contractCode,
    [h('customerName')]: row.customerName || '',
    [h('roomCode')]: row.roomCode || '',
    [h('roomName')]: row.roomName || '',
    [h('status')]: row.status || '',
    [h('terminationDate')]: row.terminationDate || '',
    [h('refundDate')]: row.refundDate || '',
    [h('totalDeposit')]: row.totalDeposit ?? '',
    [h('actualRefundAmount')]: row.actualRefundAmount ?? '',
    [h('handler')]: row.handler || '',
    [h('attachments')]: attachmentsCell(row),
    [h('remark')]: row.remark || '',
    [h('createdBy')]: row.createdBy || '',
    [h('createdAt')]: row.createdAt || '',
  }
}

export function depositRefundIoTemplateExampleRow(
  t: Translate,
): Record<string, string | number> {
  const h = (key: DepositRefundIoFieldKey) => fieldHeader(key, t)
  return {
    [h('refundCode')]: '',
    [h('contractCode')]: 'CTR2609110001',
    [h('customerName')]: '',
    [h('roomCode')]: '',
    [h('roomName')]: '',
    [h('status')]: '草稿',
    [h('terminationDate')]: '2026-09-11',
    [h('refundDate')]: '2026-09-20',
    [h('totalDeposit')]: 10000,
    [h('actualRefundAmount')]: 8500,
    [h('handler')]: '',
    [h('attachments')]: '',
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

export function pickDepositRefundIoValue(
  row: Record<string, unknown>,
  key: DepositRefundIoFieldKey,
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

export type DepositRefundImportPayload = {
  contractCode?: string
  refundCode?: string
  status?: string
  terminationDate?: string
  refundDate?: string
  totalDeposit?: number
  actualRefundAmount?: number
  remark?: string
}

export function rowToDepositRefundIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): DepositRefundImportPayload | null {
  const contractCode = pickDepositRefundIoValue(row, 'contractCode', t)
  if (!contractCode) return null

  const totalRaw = pickDepositRefundIoValue(row, 'totalDeposit', t)
  const actualRaw = pickDepositRefundIoValue(row, 'actualRefundAmount', t)

  return {
    contractCode,
    refundCode: pickDepositRefundIoValue(row, 'refundCode', t) || undefined,
    status: pickDepositRefundIoValue(row, 'status', t) || undefined,
    terminationDate:
      normalizeDateCell(pickDepositRefundIoValue(row, 'terminationDate', t)) || undefined,
    refundDate: normalizeDateCell(pickDepositRefundIoValue(row, 'refundDate', t)) || undefined,
    totalDeposit: totalRaw !== '' ? Number(totalRaw) || 0 : undefined,
    actualRefundAmount: actualRaw !== '' ? Number(actualRaw) || 0 : undefined,
    remark: pickDepositRefundIoValue(row, 'remark', t) || undefined,
  }
}
