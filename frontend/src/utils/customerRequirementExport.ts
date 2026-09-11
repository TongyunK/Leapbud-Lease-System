import type { CustomerRequirementRecord } from '@/types/customer-requirement'

/** 客户需求导入/导出字段 */
export const CUSTOMER_REQUIREMENT_IO_FIELD_KEYS = [
  'requirementCode',
  'customerCode',
  'customerName',
  'salesManager',
  'requirementDate',
  'status',
  'leaseDuration',
  'budget',
  'content',
  'remark',
  'attachment',
  'sizeConfig',
  'acConfig',
  'windowConfig',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
] as const

export type CustomerRequirementIoFieldKey = (typeof CUSTOMER_REQUIREMENT_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: CustomerRequirementIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt' || key === 'updatedBy' || key === 'updatedAt') {
    return t(`common.${key}`)
  }
  if (key === 'customerCode') return t('customer.fields.customerCode')
  if (key === 'customerName') return t('customerRequirement.fields.customerName')
  if (key === 'sizeConfig') return t('customerRequirement.fields.sizeConfig')
  if (key === 'acConfig') return t('customerRequirement.fields.acConfig')
  if (key === 'windowConfig') return t('customerRequirement.fields.windowConfig')
  return t(`customerRequirement.fields.${key}`)
}

const HEADER_ALIASES: Record<CustomerRequirementIoFieldKey, string[]> = {
  requirementCode: ['需求編號', '需求编号', 'Requirement Code'],
  customerCode: ['客戶編號', '客户编号'],
  customerName: [
    '客戶名稱',
    '客户名称',
    '公司名稱',
    '公司名称',
    '公司名稱（中文）',
    '公司名称（中文）',
    '公司名稱（英文）',
    '公司名称（英文）',
    'Company Name',
  ],
  salesManager: [
    '銷售經理',
    '销售经理',
    '結售經理',
    '结售经理',
    'Sales Manager',
  ],
  requirementDate: ['創建日期', '创建日期', 'Created Date'],
  status: ['狀態', '状态', 'Status'],
  leaseDuration: ['租賃時長', '租赁时长', 'Lease Duration'],
  budget: ['預算', '预算', 'Budget'],
  content: ['需求內容', '需求内容', 'Requirement Details'],
  remark: ['備註', '備注', '备注', 'Remark'],
  attachment: ['附件', 'Attachment'],
  sizeConfig: ['房間大小', '房间大小', 'Room Size'],
  acConfig: ['空調', '空调', 'AC'],
  windowConfig: ['窗', '窗戶', '窗户', 'Window'],
  createdBy: ['創建人', '创建人'],
  createdAt: ['創建時間', '创建时间'],
  updatedBy: ['更新人'],
  updatedAt: ['更新時間', '更新时间'],
}

export function customerRequirementToIoRow(
  o: CustomerRequirementRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: CustomerRequirementIoFieldKey) => fieldHeader(key, t)
  return {
    [h('requirementCode')]: o.requirementCode,
    [h('customerCode')]: o.customerCode || '',
    [h('customerName')]: o.customerName || '',
    [h('salesManager')]: o.salesManager || '',
    [h('requirementDate')]: o.requirementDate || '',
    [h('status')]: o.status || '',
    [h('leaseDuration')]: o.leaseDuration || '',
    [h('budget')]: o.budget ?? '',
    [h('content')]: o.content || '',
    [h('remark')]: o.remark || '',
    [h('attachment')]: o.attachment || '',
    [h('sizeConfig')]: o.sizeConfigLabel || '',
    [h('acConfig')]: o.acConfigLabel || '',
    [h('windowConfig')]: o.windowConfigLabel || '',
    [h('createdBy')]: o.createdBy || '',
    [h('createdAt')]: o.createdAt || '',
    [h('updatedBy')]: o.updatedBy || '',
    [h('updatedAt')]: o.updatedAt || '',
  }
}

export function customerRequirementIoTemplateExampleRow(
  t: Translate,
): Record<string, string | number> {
  const h = (key: CustomerRequirementIoFieldKey) => fieldHeader(key, t)
  return {
    [h('requirementCode')]: '',
    [h('customerCode')]: 'CSM260001',
    [h('customerName')]: 'Sample Customer',
    [h('salesManager')]: '',
    [h('requirementDate')]: '2026-09-10',
    [h('status')]: '跟進中',
    [h('leaseDuration')]: '12個月',
    [h('budget')]: 15000,
    [h('content')]: '需要近地鐵的辦公室',
    [h('remark')]: '',
    [h('attachment')]: '',
    [h('sizeConfig')]: '',
    [h('acConfig')]: '',
    [h('windowConfig')]: '',
    [h('createdBy')]: '',
    [h('createdAt')]: '',
    [h('updatedBy')]: '',
    [h('updatedAt')]: '',
  }
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

/** Excel 日期序列或字符串 → YYYY-MM-DD */
export function normalizeIoDate(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel serial date (days since 1899-12-30)
    const utc = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000
    const d = new Date(utc)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const raw = cellStr(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const m = raw.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/)
  if (m) {
    const pad = (n: string) => n.padStart(2, '0')
    return `${m[3]}-${pad(m[2])}-${pad(m[1])}`
  }
  return raw
}

export function pickCustomerRequirementIoValue(
  row: Record<string, unknown>,
  key: CustomerRequirementIoFieldKey,
  t: Translate,
): string {
  const headers = [fieldHeader(key, t), ...(HEADER_ALIASES[key] || [])]
  for (const h of headers) {
    if (h in row) {
      if (key === 'requirementDate') return normalizeIoDate(row[h])
      if (key === 'budget') return cellStr(row[h])
      return cellStr(row[h])
    }
  }
  const normalized = new Map(
    Object.keys(row).map((k) => [k.replace(/\s+/g, ''), row[k]]),
  )
  for (const h of headers) {
    const hit = normalized.get(h.replace(/\s+/g, ''))
    if (hit !== undefined) {
      if (key === 'requirementDate') return normalizeIoDate(hit)
      return cellStr(hit)
    }
  }
  return ''
}

export type CustomerRequirementIoPayload = {
  requirementCode: string
  customerCode: string
  customerName: string
  salesManager: string
  requirementDate: string
  status: string
  leaseDuration: string
  budget: number | null
  content: string
  remark: string
  attachment: string
  sizeConfig: string
  acConfig: string
  windowConfig: string
}

export function rowToCustomerRequirementIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): CustomerRequirementIoPayload | null {
  const customerCode = pickCustomerRequirementIoValue(row, 'customerCode', t)
  const customerName = pickCustomerRequirementIoValue(row, 'customerName', t)
  // 旧系统导出通常只有「客户名称」，没有「客户编号」
  if (!customerCode && !customerName) return null

  const budgetRaw = pickCustomerRequirementIoValue(row, 'budget', t)
  let budget: number | null = null
  if (budgetRaw) {
    const n = Number(String(budgetRaw).replace(/,/g, ''))
    budget = Number.isFinite(n) ? n : null
  }

  return {
    requirementCode: pickCustomerRequirementIoValue(row, 'requirementCode', t),
    customerCode,
    customerName,
    salesManager: pickCustomerRequirementIoValue(row, 'salesManager', t),
    requirementDate: pickCustomerRequirementIoValue(row, 'requirementDate', t),
    status: pickCustomerRequirementIoValue(row, 'status', t) || '跟進中',
    leaseDuration: pickCustomerRequirementIoValue(row, 'leaseDuration', t),
    budget,
    content: pickCustomerRequirementIoValue(row, 'content', t),
    remark: pickCustomerRequirementIoValue(row, 'remark', t),
    attachment: pickCustomerRequirementIoValue(row, 'attachment', t),
    sizeConfig: pickCustomerRequirementIoValue(row, 'sizeConfig', t),
    acConfig: pickCustomerRequirementIoValue(row, 'acConfig', t),
    windowConfig: pickCustomerRequirementIoValue(row, 'windowConfig', t),
  }
}
