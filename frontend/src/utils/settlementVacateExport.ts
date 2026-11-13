import type { ContractSettlementRecord } from '@/types/contract-settlement'

export const SETTLEMENT_VACATE_IO_FIELD_KEYS = [
  'settlementCode',
  'legacyTerminationCode',
  'contractCode',
  'reason',
  'terminationDate',
  'terminationKind',
  'noticeAttachment',
  'doorKeyReturnedQty',
  'smartCardReturnedQty',
  'siteCondition',
  'remark',
  'customerName',
  'roomCode',
  'createdBy',
  'createdAt',
] as const

export type SettlementVacateIoFieldKey = (typeof SETTLEMENT_VACATE_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: SettlementVacateIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt') return t(`common.${key}`)
  return t(`contractSettlement.fields.${key}`)
}

const HEADER_ALIASES: Record<SettlementVacateIoFieldKey, string[]> = {
  settlementCode: ['終止結算編號', '终止结算编号', '結算編號', '结算编号'],
  legacyTerminationCode: ['舊退租編號', '旧退租编号', '退租編號', '退租编号'],
  contractCode: ['合約編號', '合约编号'],
  reason: ['終止原因', '终止原因', '退租原因'],
  terminationDate: ['終止日期', '终止日期', '退租日期'],
  terminationKind: ['退租類型', '退租类型'],
  noticeAttachment: ['書面通知附件', '书面通知附件', '客戶書面通知附件', '客户书面通知附件'],
  doorKeyReturnedQty: ['房門匙回收', '房门匙回收', '房門匙 - 已回收數量'],
  smartCardReturnedQty: ['智能卡回收', '智能咭 - 已回收數量'],
  siteCondition: ['現場情況', '现场情况'],
  remark: ['備註', '备注'],
  customerName: ['客戶名稱', '客户名称'],
  roomCode: ['房間編號', '房间编号'],
  createdBy: ['創建人', '创建人', 'Created By'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
}

export function settlementVacateToIoRow(
  row: ContractSettlementRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: SettlementVacateIoFieldKey) => fieldHeader(key, t)
  return {
    [h('settlementCode')]: row.settlementCode,
    [h('legacyTerminationCode')]: row.legacyTerminationCode || '',
    [h('contractCode')]: row.contractCode,
    [h('reason')]: row.reason || '',
    [h('terminationDate')]: row.terminationDate || '',
    [h('terminationKind')]: row.terminationKind || '',
    [h('noticeAttachment')]: row.noticeAttachment || '',
    [h('doorKeyReturnedQty')]: row.doorKeyReturnedQty,
    [h('smartCardReturnedQty')]: row.smartCardReturnedQty,
    [h('siteCondition')]: row.siteCondition || '',
    [h('remark')]: row.remark || '',
    [h('customerName')]: row.customerName || '',
    [h('roomCode')]: row.roomCode || '',
    [h('createdBy')]: row.createdBy || '',
    [h('createdAt')]: row.createdAt || '',
  }
}

export function settlementVacateIoTemplateExampleRow(
  t: Translate,
): Record<string, string | number> {
  const h = (key: SettlementVacateIoFieldKey) => fieldHeader(key, t)
  return {
    [h('settlementCode')]: '',
    [h('legacyTerminationCode')]: '',
    [h('contractCode')]: 'CTR2609110001',
    [h('reason')]: '租約期滿',
    [h('terminationDate')]: '2026-09-11',
    [h('terminationKind')]: 'expiry',
    [h('noticeAttachment')]: '',
    [h('doorKeyReturnedQty')]: 2,
    [h('smartCardReturnedQty')]: 1,
    [h('siteCondition')]: '',
    [h('remark')]: '',
    [h('customerName')]: '',
    [h('roomCode')]: '',
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

export function pickSettlementVacateIoValue(
  row: Record<string, unknown>,
  key: SettlementVacateIoFieldKey,
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

export type SettlementVacateImportPayload = {
  contractCode?: string
  roomCode?: string
  customerName?: string
  legacyTerminationCode?: string
  reason?: string
  terminationDate?: string
  terminationKind?: string
  noticeAttachment?: string
  doorKeyReturnedQty?: number
  smartCardReturnedQty?: number
  siteCondition?: string
  remark?: string
}

export function rowToSettlementVacateIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): SettlementVacateImportPayload | null {
  const contractCode = pickSettlementVacateIoValue(row, 'contractCode', t)
  const roomCode = pickSettlementVacateIoValue(row, 'roomCode', t)
  const customerName = pickSettlementVacateIoValue(row, 'customerName', t)
  // 旧系统可能只有房间编号
  if (!contractCode && !roomCode) return null

  const doorRaw = pickSettlementVacateIoValue(row, 'doorKeyReturnedQty', t)
  const smartRaw = pickSettlementVacateIoValue(row, 'smartCardReturnedQty', t)

  return {
    contractCode: contractCode || undefined,
    roomCode: roomCode || undefined,
    customerName: customerName || undefined,
    legacyTerminationCode:
      pickSettlementVacateIoValue(row, 'legacyTerminationCode', t) || undefined,
    reason: pickSettlementVacateIoValue(row, 'reason', t) || undefined,
    terminationDate:
      normalizeDateCell(pickSettlementVacateIoValue(row, 'terminationDate', t)) || undefined,
    terminationKind: pickSettlementVacateIoValue(row, 'terminationKind', t) || undefined,
    noticeAttachment: pickSettlementVacateIoValue(row, 'noticeAttachment', t) || undefined,
    doorKeyReturnedQty: doorRaw !== '' ? Math.max(0, Math.floor(Number(doorRaw) || 0)) : undefined,
    smartCardReturnedQty:
      smartRaw !== '' ? Math.max(0, Math.floor(Number(smartRaw) || 0)) : undefined,
    siteCondition: pickSettlementVacateIoValue(row, 'siteCondition', t) || undefined,
    remark: pickSettlementVacateIoValue(row, 'remark', t) || undefined,
  }
}
