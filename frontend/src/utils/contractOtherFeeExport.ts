import type { ContractOtherFeeRecord } from '@/types/contract-other-fee'

export const CONTRACT_OTHER_FEE_IO_FIELD_KEYS = [
  'contractCode',
  'terminationCode',
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

export type ContractOtherFeeIoFieldKey = (typeof CONTRACT_OTHER_FEE_IO_FIELD_KEYS)[number]

export type ContractOtherFeeIoLabelNs = 'contractOtherFee' | 'depositDeduction'

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(
  key: ContractOtherFeeIoFieldKey,
  t: Translate,
  ns: ContractOtherFeeIoLabelNs,
): string {
  if (key === 'createdBy' || key === 'createdAt') return t(`common.${key}`)
  if (key === 'sortOrder' && ns === 'depositDeduction') {
    return t('contractOtherFee.fields.sortOrder')
  }
  if (key === 'remark' && ns === 'depositDeduction') {
    return t('contractOtherFee.fields.remark')
  }
  if ((key === 'roomCode' || key === 'customerName') && ns === 'depositDeduction') {
    return t(`contractOtherFee.fields.${key}`)
  }
  return t(`${ns}.fields.${key}`)
}

const HEADER_ALIASES: Record<ContractOtherFeeIoFieldKey, string[]> = {
  contractCode: ['合約編號', '合约编号'],
  terminationCode: ['退租編號', '退租编号', '退租单', '退租單'],
  roomCode: ['房間編號', '房间编号'],
  customerName: ['客戶名稱', '客户名称'],
  description: ['描述', '扣款描述'],
  quantity: ['數量', '数量'],
  unitAmount: ['單價（按金）', '单价（按金）', '按金', '扣除金額', '扣除金额'],
  subtotal: ['小計', '小计', '扣除小計', '扣除小计'],
  remark: ['備註', '备注'],
  sortOrder: ['排序', '排序权重', '排序權重'],
  createdBy: ['創建人', '创建人', 'Created By'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
}

export function contractOtherFeeToIoRow(
  row: ContractOtherFeeRecord,
  t: Translate,
  ns: ContractOtherFeeIoLabelNs = 'contractOtherFee',
): Record<string, string | number> {
  const h = (key: ContractOtherFeeIoFieldKey) => fieldHeader(key, t, ns)
  return {
    [h('contractCode')]: row.contractCode,
    [h('terminationCode')]: row.terminationCode || '',
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

export function contractOtherFeeIoTemplateExampleRow(
  t: Translate,
  ns: ContractOtherFeeIoLabelNs = 'contractOtherFee',
): Record<string, string | number> {
  const h = (key: ContractOtherFeeIoFieldKey) => fieldHeader(key, t, ns)
  return {
    [h('contractCode')]: 'CTR2609110001',
    [h('terminationCode')]: '',
    [h('roomCode')]: '',
    [h('customerName')]: '',
    [h('description')]: ns === 'depositDeduction' ? '清潔費' : '其他費用',
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

export function pickContractOtherFeeIoValue(
  row: Record<string, unknown>,
  key: ContractOtherFeeIoFieldKey,
  t: Translate,
  ns: ContractOtherFeeIoLabelNs = 'contractOtherFee',
): string {
  const headers = [fieldHeader(key, t, ns), ...(HEADER_ALIASES[key] || [])]
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

export type ContractOtherFeeImportPayload = {
  contractCode?: string
  terminationCode?: string
  roomCode?: string
  customerName?: string
  description?: string
  quantity?: number
  unitAmount?: number
  subtotal?: number
  remark?: string
  sortOrder?: number
}

export function rowToContractOtherFeeIoPayload(
  row: Record<string, unknown>,
  t: Translate,
  ns: ContractOtherFeeIoLabelNs = 'contractOtherFee',
): ContractOtherFeeImportPayload | null {
  const contractCode = pickContractOtherFeeIoValue(row, 'contractCode', t, ns)
  const terminationCode = pickContractOtherFeeIoValue(row, 'terminationCode', t, ns)
  const roomCode = pickContractOtherFeeIoValue(row, 'roomCode', t, ns)
  const customerName = pickContractOtherFeeIoValue(row, 'customerName', t, ns)
  // 合约编号 / 退租编号 / 房间编号 任一即可
  if (!contractCode && !terminationCode && !roomCode) return null

  const quantityRaw = pickContractOtherFeeIoValue(row, 'quantity', t, ns)
  const unitRaw = pickContractOtherFeeIoValue(row, 'unitAmount', t, ns)
  const subRaw = pickContractOtherFeeIoValue(row, 'subtotal', t, ns)
  const sortRaw = pickContractOtherFeeIoValue(row, 'sortOrder', t, ns)
  const quantity = quantityRaw !== '' ? Number(quantityRaw) || 0 : 0
  const unitAmount = unitRaw !== '' ? Number(unitRaw) || 0 : 0
  const subtotal =
    subRaw !== ''
      ? Number(subRaw) || 0
      : quantity * unitAmount

  return {
    contractCode: contractCode || undefined,
    terminationCode: terminationCode || undefined,
    roomCode: roomCode || undefined,
    customerName: customerName || undefined,
    description: pickContractOtherFeeIoValue(row, 'description', t, ns) || undefined,
    quantity,
    unitAmount,
    subtotal,
    remark: pickContractOtherFeeIoValue(row, 'remark', t, ns) || undefined,
    sortOrder: sortRaw !== '' ? Math.floor(Number(sortRaw) || 0) : undefined,
  }
}
