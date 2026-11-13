import type { ContractLoanItemRecord } from '@/types/contract-loan-item'

export const CONTRACT_LOAN_ITEM_IO_FIELD_KEYS = [
  'contractCode',
  'roomCode',
  'customerName',
  'description',
  'quantity',
  'unitAmount',
  'subtotal',
  'remark',
  'sortOrder',
  'createdBy',
  'createdAt',
] as const

export type ContractLoanItemIoFieldKey = (typeof CONTRACT_LOAN_ITEM_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: ContractLoanItemIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt') return t(`common.${key}`)
  return t(`contractLoanItem.fields.${key}`)
}

const HEADER_ALIASES: Record<ContractLoanItemIoFieldKey, string[]> = {
  contractCode: ['合約編號', '合约编号'],
  roomCode: ['房間編號', '房间编号'],
  customerName: ['客戶名稱', '客户名称'],
  description: ['描述', '物品描述', '借出物品'],
  quantity: ['數量', '数量'],
  unitAmount: ['單價（按金）', '单价（按金）', '按金'],
  subtotal: ['小計', '小计'],
  remark: ['備註', '备注'],
  sortOrder: ['排序', '排序权重', '排序權重'],
  createdBy: ['創建人', '创建人', 'Created By'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
}

export function contractLoanItemToIoRow(
  row: ContractLoanItemRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: ContractLoanItemIoFieldKey) => fieldHeader(key, t)
  return {
    [h('contractCode')]: row.contractCode,
    [h('roomCode')]: row.roomCode || '',
    [h('customerName')]: row.customerName || '',
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

export function contractLoanItemIoTemplateExampleRow(
  t: Translate,
): Record<string, string | number> {
  const h = (key: ContractLoanItemIoFieldKey) => fieldHeader(key, t)
  return {
    [h('contractCode')]: 'CTR2609110001',
    [h('roomCode')]: '',
    [h('customerName')]: '',
    [h('description')]: '借出物品',
    [h('quantity')]: 1,
    [h('unitAmount')]: 500,
    [h('subtotal')]: 500,
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

export function pickContractLoanItemIoValue(
  row: Record<string, unknown>,
  key: ContractLoanItemIoFieldKey,
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

export type ContractLoanItemImportPayload = {
  contractCode?: string
  roomCode?: string
  customerName?: string
  description?: string
  quantity?: number
  unitAmount?: number
  subtotal?: number
  remark?: string
  sortOrder?: number
}

export function rowToContractLoanItemIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): ContractLoanItemImportPayload | null {
  const contractCode = pickContractLoanItemIoValue(row, 'contractCode', t)
  const roomCode = pickContractLoanItemIoValue(row, 'roomCode', t)
  const customerName = pickContractLoanItemIoValue(row, 'customerName', t)
  if (!contractCode && !roomCode) return null

  const quantityRaw = pickContractLoanItemIoValue(row, 'quantity', t)
  const unitRaw = pickContractLoanItemIoValue(row, 'unitAmount', t)
  const subRaw = pickContractLoanItemIoValue(row, 'subtotal', t)
  const sortRaw = pickContractLoanItemIoValue(row, 'sortOrder', t)
  const quantity = quantityRaw !== '' ? Number(quantityRaw) || 0 : 0
  const unitAmount = unitRaw !== '' ? Number(unitRaw) || 0 : 0
  const subtotal = subRaw !== '' ? Number(subRaw) || 0 : quantity * unitAmount

  return {
    contractCode: contractCode || undefined,
    roomCode: roomCode || undefined,
    customerName: customerName || undefined,
    description: pickContractLoanItemIoValue(row, 'description', t) || undefined,
    quantity,
    unitAmount,
    subtotal,
    remark: pickContractLoanItemIoValue(row, 'remark', t) || undefined,
    sortOrder: sortRaw !== '' ? Math.floor(Number(sortRaw) || 0) : undefined,
  }
}
