import type { LeaseTerminationRecord } from '@/types/lease-termination'

export const LEASE_TERMINATION_IO_FIELD_KEYS = [
  'terminationCode',
  'contractCode',
  'reason',
  'terminationDate',
  'noticeAttachment',
  'doorKeyReturnedQty',
  'smartCardReturnedQty',
  'siteCondition',
  'remark',
  'relatedDepositRefund',
  'customerName',
  'roomCode',
  'createdBy',
  'createdAt',
] as const

export type LeaseTerminationIoFieldKey = (typeof LEASE_TERMINATION_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: LeaseTerminationIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt') return t(`common.${key}`)
  return t(`leaseTermination.fields.${key}`)
}

const HEADER_ALIASES: Record<LeaseTerminationIoFieldKey, string[]> = {
  terminationCode: ['退租編號', '退租编号'],
  contractCode: ['合約編號', '合约编号'],
  reason: ['退租原因'],
  terminationDate: ['退租日期'],
  noticeAttachment: ['書面通知附件', '书面通知附件', '客戶書面通知附件', '客户书面通知附件'],
  doorKeyReturnedQty: ['房門匙回收', '房门匙回收', '房門匙 - 已回收數量'],
  smartCardReturnedQty: ['智能卡回收', '智能咭 - 已回收數量'],
  siteCondition: ['現場情況', '现场情况'],
  remark: ['備註', '备注'],
  relatedDepositRefund: ['關聯退按金', '关联退按金', '關聯退按金單', '关联退按金单'],
  customerName: ['客戶名稱', '客户名称'],
  roomCode: ['房間編號', '房间编号'],
  createdBy: ['創建人', '创建人', 'Created By'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
}

export function leaseTerminationToIoRow(
  row: LeaseTerminationRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: LeaseTerminationIoFieldKey) => fieldHeader(key, t)
  return {
    [h('terminationCode')]: row.terminationCode,
    [h('contractCode')]: row.contractCode,
    [h('reason')]: row.reason || '',
    [h('terminationDate')]: row.terminationDate || '',
    [h('noticeAttachment')]: row.noticeAttachment || '',
    [h('doorKeyReturnedQty')]: row.doorKeyReturnedQty,
    [h('smartCardReturnedQty')]: row.smartCardReturnedQty,
    [h('siteCondition')]: row.siteCondition || '',
    [h('remark')]: row.remark || '',
    [h('relatedDepositRefund')]: row.relatedDepositRefund || '',
    [h('customerName')]: row.customerName || '',
    [h('roomCode')]: row.roomCode || '',
    [h('createdBy')]: row.createdBy || '',
    [h('createdAt')]: row.createdAt || '',
  }
}

export function leaseTerminationIoTemplateExampleRow(
  t: Translate,
): Record<string, string | number> {
  const h = (key: LeaseTerminationIoFieldKey) => fieldHeader(key, t)
  return {
    [h('terminationCode')]: '',
    [h('contractCode')]: 'CTR2609110001',
    [h('reason')]: '租約期滿',
    [h('terminationDate')]: '2026-09-11',
    [h('noticeAttachment')]: '',
    [h('doorKeyReturnedQty')]: 2,
    [h('smartCardReturnedQty')]: 1,
    [h('siteCondition')]: '',
    [h('remark')]: '',
    [h('relatedDepositRefund')]: '',
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

export function pickLeaseTerminationIoValue(
  row: Record<string, unknown>,
  key: LeaseTerminationIoFieldKey,
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

export type LeaseTerminationImportPayload = {
  contractCode?: string
  roomCode?: string
  customerName?: string
  terminationCode?: string
  reason?: string
  terminationDate?: string
  noticeAttachment?: string
  doorKeyReturnedQty?: number
  smartCardReturnedQty?: number
  siteCondition?: string
  remark?: string
  relatedDepositRefund?: string
}

export function rowToLeaseTerminationIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): LeaseTerminationImportPayload | null {
  const contractCode = pickLeaseTerminationIoValue(row, 'contractCode', t)
  const roomCode = pickLeaseTerminationIoValue(row, 'roomCode', t)
  const customerName = pickLeaseTerminationIoValue(row, 'customerName', t)
  // 旧系统可能只有房间编号
  if (!contractCode && !roomCode) return null

  const doorRaw = pickLeaseTerminationIoValue(row, 'doorKeyReturnedQty', t)
  const smartRaw = pickLeaseTerminationIoValue(row, 'smartCardReturnedQty', t)

  return {
    contractCode: contractCode || undefined,
    roomCode: roomCode || undefined,
    customerName: customerName || undefined,
    terminationCode: pickLeaseTerminationIoValue(row, 'terminationCode', t) || undefined,
    reason: pickLeaseTerminationIoValue(row, 'reason', t) || undefined,
    terminationDate:
      normalizeDateCell(pickLeaseTerminationIoValue(row, 'terminationDate', t)) || undefined,
    noticeAttachment: pickLeaseTerminationIoValue(row, 'noticeAttachment', t) || undefined,
    doorKeyReturnedQty: doorRaw !== '' ? Math.max(0, Math.floor(Number(doorRaw) || 0)) : undefined,
    smartCardReturnedQty:
      smartRaw !== '' ? Math.max(0, Math.floor(Number(smartRaw) || 0)) : undefined,
    siteCondition: pickLeaseTerminationIoValue(row, 'siteCondition', t) || undefined,
    remark: pickLeaseTerminationIoValue(row, 'remark', t) || undefined,
    relatedDepositRefund:
      pickLeaseTerminationIoValue(row, 'relatedDepositRefund', t) || undefined,
  }
}
