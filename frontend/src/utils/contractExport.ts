import type { ContractRecord } from '@/types/contract'

/** 合约导入/导出字段（Excel；关联用编号而非 ID） */
export const CONTRACT_IO_FIELD_KEYS = [
  'contractCode',
  'roomCode',
  'customerCode',
  'customerName',
  'salesManager',
  'requirementCode',
  'startDate',
  'endDate',
  'actualEndDate',
  'leaseType',
  'status',
  'monthlyRent',
  'roomDeposit',
  'bookingDeposit',
  'paymentCycle',
  'electricityRate',
  'miscDeposit',
  'doorKeyQty',
  'mailboxKeyQty',
  'roomNameText',
  'subleaseMark',
  'attachment',
  'remark',
  'buildingName',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
] as const

export type ContractIoFieldKey = (typeof CONTRACT_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: ContractIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt' || key === 'updatedBy' || key === 'updatedAt') {
    return t(`common.${key}`)
  }
  if (key === 'customerCode') return t('customer.fields.customerCode')
  if (key === 'requirementCode') return t('contract.fields.requirementCode')
  return t(`contract.fields.${key}`)
}

const HEADER_ALIASES: Record<ContractIoFieldKey, string[]> = {
  contractCode: ['合約編號', '合约编号', 'Contract Code'],
  roomCode: ['房間編號', '房间编号', 'Room Code'],
  customerCode: ['客戶編號', '客户编号'],
  customerName: ['客戶名稱', '客户名称'],
  salesManager: ['銷售經理', '销售经理', '結售經理', '结售经理', 'Sales Manager'],
  requirementCode: ['需求編號', '需求编号'],
  startDate: ['合約開始日期', '合约开始日期', '開始日期', '开始日期'],
  endDate: ['合約到期日期', '合约到期日期', '結束日期', '结束日期'],
  actualEndDate: ['實際退租日期', '实际退租日期'],
  leaseType: ['租賃方式', '租赁方式'],
  status: ['狀態', '状态', 'Status'],
  monthlyRent: ['租金/月', '月租'],
  roomDeposit: ['房間按金', '房间按金'],
  bookingDeposit: ['訂金', '订金'],
  paymentCycle: ['繳費周期', '缴费周期'],
  electricityRate: ['電費/度', '电费/度'],
  miscDeposit: ['雜項按金', '杂项按金'],
  doorKeyQty: ['房門匙數量', '房门匙数量'],
  mailboxKeyQty: ['智能卡信箱匙數量', '智能卡信箱匙数量', '信箱匙數量'],
  roomNameText: ['房間名稱文本', '房间名称文本'],
  subleaseMark: ['分租符號', '分租符号'],
  attachment: ['客戶簽約附件', '客户签约附件', '附件'],
  remark: ['備註', '備注', '备注'],
  buildingName: ['所屬大廈', '所属大厦'],
  createdBy: ['創建人', '创建人'],
  createdAt: ['創建時間', '创建时间'],
  updatedBy: ['更新人'],
  updatedAt: ['更新時間', '更新时间'],
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

export function contractToIoRow(
  o: ContractRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: ContractIoFieldKey) => fieldHeader(key, t)
  return {
    [h('contractCode')]: o.contractCode,
    [h('roomCode')]: o.roomCode || '',
    [h('customerCode')]: o.customerCode || '',
    [h('customerName')]: o.customerName || '',
    [h('salesManager')]: o.salesManager || '',
    [h('requirementCode')]: o.requirementCode || '',
    [h('startDate')]: o.startDate || '',
    [h('endDate')]: o.endDate || '',
    [h('actualEndDate')]: o.actualEndDate || '',
    [h('leaseType')]: o.leaseType || '',
    [h('status')]: o.status || '',
    [h('monthlyRent')]: o.monthlyRent ?? '',
    [h('roomDeposit')]: o.roomDeposit ?? '',
    [h('bookingDeposit')]: o.bookingDeposit ?? '',
    [h('paymentCycle')]: o.paymentCycle || '',
    [h('electricityRate')]: o.electricityRate ?? '',
    [h('miscDeposit')]: o.miscDeposit ?? '',
    [h('doorKeyQty')]: o.doorKeyQty ?? 0,
    [h('mailboxKeyQty')]: o.mailboxKeyQty ?? 0,
    [h('roomNameText')]: o.roomNameText || '',
    [h('subleaseMark')]: o.subleaseMark || '',
    [h('attachment')]: o.attachment || '',
    [h('remark')]: o.remark || '',
    [h('buildingName')]: o.buildingName || '',
    [h('createdBy')]: o.createdBy || '',
    [h('createdAt')]: o.createdAt || '',
    [h('updatedBy')]: o.updatedBy || '',
    [h('updatedAt')]: o.updatedAt || '',
  }
}

export function contractIoTemplateExampleRow(t: Translate): Record<string, string | number> {
  const h = (key: ContractIoFieldKey) => fieldHeader(key, t)
  return {
    [h('contractCode')]: '',
    [h('roomCode')]: 'SP3C06',
    [h('customerCode')]: 'CSM260001',
    [h('customerName')]: '',
    [h('salesManager')]: '',
    [h('requirementCode')]: '',
    [h('startDate')]: '2026-05-22',
    [h('endDate')]: '2027-05-21',
    [h('actualEndDate')]: '',
    [h('leaseType')]: '整租',
    [h('status')]: '草稿',
    [h('monthlyRent')]: 12000,
    [h('roomDeposit')]: 24000,
    [h('bookingDeposit')]: '',
    [h('paymentCycle')]: '月繳',
    [h('electricityRate')]: '',
    [h('miscDeposit')]: '',
    [h('doorKeyQty')]: 1,
    [h('mailboxKeyQty')]: 1,
    [h('roomNameText')]: '',
    [h('subleaseMark')]: '',
    [h('attachment')]: '',
    [h('remark')]: '',
    [h('buildingName')]: '',
    [h('createdBy')]: '',
    [h('createdAt')]: '',
    [h('updatedBy')]: '',
    [h('updatedAt')]: '',
  }
}

export function pickContractIoValue(
  row: Record<string, unknown>,
  key: ContractIoFieldKey,
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

/** 导入解析结果（仍用 roomCode/customerCode；提交前由前端或后端解析 ID） */
export type ContractIoPayload = {
  contractCode: string
  roomCode: string
  customerCode: string
  customerName: string
  salesManager: string
  requirementCode: string
  startDate: string
  endDate: string
  actualEndDate: string
  leaseType: string
  status: string
  monthlyRent: number | null
  roomDeposit: number | null
  bookingDeposit: number | null
  paymentCycle: string
  electricityRate: number | null
  miscDeposit: number | null
  doorKeyQty: number
  mailboxKeyQty: number
  roomNameText: string
  subleaseMark: string
  attachment: string
  remark: string
}

function parseNum(raw: string): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function rowToContractIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): ContractIoPayload | null {
  const roomCode = pickContractIoValue(row, 'roomCode', t)
  const customerCode = pickContractIoValue(row, 'customerCode', t)
  const customerName = pickContractIoValue(row, 'customerName', t)
  // 房间编号必填；客户编号或客户名称至少其一（旧系统常只有名称）
  if (!roomCode || (!customerCode && !customerName)) return null

  const doorRaw = pickContractIoValue(row, 'doorKeyQty', t)
  const mailRaw = pickContractIoValue(row, 'mailboxKeyQty', t)

  return {
    contractCode: pickContractIoValue(row, 'contractCode', t),
    roomCode,
    customerCode,
    customerName,
    salesManager: pickContractIoValue(row, 'salesManager', t),
    requirementCode: pickContractIoValue(row, 'requirementCode', t),
    startDate: normalizeDateCell(pickContractIoValue(row, 'startDate', t)),
    endDate: normalizeDateCell(pickContractIoValue(row, 'endDate', t)),
    actualEndDate: normalizeDateCell(pickContractIoValue(row, 'actualEndDate', t)),
    leaseType: pickContractIoValue(row, 'leaseType', t),
    status: pickContractIoValue(row, 'status', t) || '草稿',
    monthlyRent: parseNum(pickContractIoValue(row, 'monthlyRent', t)),
    roomDeposit: parseNum(pickContractIoValue(row, 'roomDeposit', t)),
    bookingDeposit: parseNum(pickContractIoValue(row, 'bookingDeposit', t)),
    paymentCycle: pickContractIoValue(row, 'paymentCycle', t),
    electricityRate: parseNum(pickContractIoValue(row, 'electricityRate', t)),
    miscDeposit: parseNum(pickContractIoValue(row, 'miscDeposit', t)),
    doorKeyQty: Math.max(0, Math.floor(Number(doorRaw || 0) || 0)),
    mailboxKeyQty: Math.max(0, Math.floor(Number(mailRaw || 0) || 0)),
    roomNameText: pickContractIoValue(row, 'roomNameText', t),
    subleaseMark: pickContractIoValue(row, 'subleaseMark', t),
    attachment: pickContractIoValue(row, 'attachment', t),
    remark: pickContractIoValue(row, 'remark', t),
  }
}

/** 后端导入 API 的 payload（带编号，由服务端解析） */
export type ContractImportApiItem = {
  contractCode?: string
  roomCode: string
  customerCode?: string
  customerName?: string
  salesManager?: string
  requirementCode?: string
  startDate?: string | null
  endDate?: string | null
  actualEndDate?: string | null
  leaseType?: string
  status?: string
  monthlyRent?: number | null
  roomDeposit?: number | null
  bookingDeposit?: number | null
  paymentCycle?: string
  electricityRate?: number | null
  miscDeposit?: number | null
  doorKeyQty?: number
  mailboxKeyQty?: number
  roomNameText?: string
  subleaseMark?: string
  attachment?: string
  remark?: string
}

export function contractIoPayloadToImportItem(p: ContractIoPayload): ContractImportApiItem {
  return {
    contractCode: p.contractCode || undefined,
    roomCode: p.roomCode,
    customerCode: p.customerCode || undefined,
    customerName: p.customerName || undefined,
    salesManager: p.salesManager || undefined,
    requirementCode: p.requirementCode || undefined,
    startDate: p.startDate || null,
    endDate: p.endDate || null,
    actualEndDate: p.actualEndDate || null,
    leaseType: p.leaseType || undefined,
    status: p.status || undefined,
    monthlyRent: p.monthlyRent,
    roomDeposit: p.roomDeposit,
    bookingDeposit: p.bookingDeposit,
    paymentCycle: p.paymentCycle || undefined,
    electricityRate: p.electricityRate,
    miscDeposit: p.miscDeposit,
    doorKeyQty: p.doorKeyQty,
    mailboxKeyQty: p.mailboxKeyQty,
    roomNameText: p.roomNameText || undefined,
    subleaseMark: p.subleaseMark || undefined,
    attachment: p.attachment || undefined,
    remark: p.remark || undefined,
  }
}
