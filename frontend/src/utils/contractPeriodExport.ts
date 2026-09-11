import type { ContractPeriodListRecord } from '@/types/contract-period'
import type { ContractPeriodWritePayload } from '@/api/contract-periods'

export const CONTRACT_PERIOD_IO_FIELD_KEYS = [
  'contractCode',
  'dateType',
  'dateUnit',
  'dateValue',
  'startDate',
  'endDate',
  'sortOrder',
  'customerName',
  'roomCode',
  'createdAt',
  'updatedAt',
] as const

export type ContractPeriodIoFieldKey = (typeof CONTRACT_PERIOD_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: ContractPeriodIoFieldKey, t: Translate): string {
  if (key === 'createdAt' || key === 'updatedAt') return t(`common.${key}`)
  if (key === 'contractCode') return t('contract.fields.contractCode')
  if (key === 'customerName') return t('contract.fields.customerName')
  if (key === 'roomCode') return t('contract.fields.roomCode')
  if (key === 'startDate') return t('contract.fields.periodStart')
  if (key === 'endDate') return t('contract.fields.periodEnd')
  return t(`contractPeriod.fields.${key}`)
}

const HEADER_ALIASES: Record<ContractPeriodIoFieldKey, string[]> = {
  contractCode: ['合約編號', '合约编号', '关联合约', '關聯合約'],
  dateType: ['日期類型', '日期类型'],
  dateUnit: ['日期單位', '日期单位'],
  dateValue: ['日期數值', '日期数值'],
  startDate: ['開始日期', '开始日期'],
  endDate: ['結束日期', '结束日期'],
  sortOrder: ['排序', '排序权重', '排序權重'],
  customerName: ['客戶名稱', '客户名称'],
  roomCode: ['房間編號', '房间编号'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
  updatedAt: ['更新時間', '更新时间', 'Updated At'],
}

export function contractPeriodToIoRow(
  row: ContractPeriodListRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: ContractPeriodIoFieldKey) => fieldHeader(key, t)
  return {
    [h('contractCode')]: row.contractCode,
    [h('dateType')]: row.dateType,
    [h('dateUnit')]: row.dateUnit,
    [h('dateValue')]: row.dateValue,
    [h('startDate')]: row.startDate,
    [h('endDate')]: row.endDate,
    [h('sortOrder')]: row.sortOrder,
    [h('customerName')]: row.customerName || '',
    [h('roomCode')]: row.roomCode || '',
    [h('createdAt')]: row.createdAt || '',
    [h('updatedAt')]: row.updatedAt || '',
  }
}

export function contractPeriodIoTemplateExampleRow(
  t: Translate,
): Record<string, string | number> {
  const h = (key: ContractPeriodIoFieldKey) => fieldHeader(key, t)
  return {
    [h('contractCode')]: 'CTR2609110001',
    [h('dateType')]: '使用期',
    [h('dateUnit')]: '月',
    [h('dateValue')]: 12,
    [h('startDate')]: '2026-05-22',
    [h('endDate')]: '2027-05-21',
    [h('sortOrder')]: 0,
    [h('customerName')]: '',
    [h('roomCode')]: '',
    [h('createdAt')]: '',
    [h('updatedAt')]: '',
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
  // Excel serial date
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

export function pickContractPeriodIoValue(
  row: Record<string, unknown>,
  key: ContractPeriodIoFieldKey,
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

export function rowToContractPeriodIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): ContractPeriodWritePayload | null {
  const contractCode = pickContractPeriodIoValue(row, 'contractCode', t)
  const roomCode = pickContractPeriodIoValue(row, 'roomCode', t)
  const customerName = pickContractPeriodIoValue(row, 'customerName', t)
  const dateType = pickContractPeriodIoValue(row, 'dateType', t)
  const startDate = normalizeDateCell(pickContractPeriodIoValue(row, 'startDate', t))
  const endDate = normalizeDateCell(pickContractPeriodIoValue(row, 'endDate', t))
  // 旧系统可能只有房间编号，无合约编号
  if ((!contractCode && !roomCode) || !dateType || !startDate || !endDate) return null

  const dateUnit = pickContractPeriodIoValue(row, 'dateUnit', t) || '月'
  const dateValueRaw = pickContractPeriodIoValue(row, 'dateValue', t)
  const sortRaw = pickContractPeriodIoValue(row, 'sortOrder', t)
  return {
    contractCode: contractCode || undefined,
    roomCode: roomCode || undefined,
    customerName: customerName || undefined,
    dateType,
    dateUnit,
    dateValue: dateValueRaw ? Math.max(0, Math.floor(Number(dateValueRaw) || 0)) : 0,
    startDate,
    endDate,
    sortOrder: sortRaw !== '' ? Math.floor(Number(sortRaw) || 0) : undefined,
  }
}
