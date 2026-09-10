import type { OccupantRecord } from '@/types/customer'

/** 使用者导入/导出字段（兼容旧系统「使用者.xlsx」表头） */
export const OCCUPANT_IO_FIELD_KEYS = [
  'name',
  'customerCode',
  'relatedCustomerName',
  'whatsapp',
  'mobilePhone',
  'contactPhone',
  'email',
  'fax',
  'address',
  'idCardNo',
  'idCardImage',
  'addressProofCopy',
  'remark',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
] as const

export type OccupantIoFieldKey = (typeof OCCUPANT_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: OccupantIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt' || key === 'updatedBy' || key === 'updatedAt') {
    return t(`common.${key}`)
  }
  if (key === 'customerCode') {
    return t('customer.fields.customerCode')
  }
  return t(`occupant.fields.${key}`)
}

const HEADER_ALIASES: Record<OccupantIoFieldKey, string[]> = {
  name: ['姓名', '使用者姓名', '使用者名稱', '名称'],
  customerCode: ['客戶編號', '客户编号', '所屬客戶編號'],
  relatedCustomerName: ['關聯客戶', '关联客户', '所屬客戶', '所属客户', '客戶名稱', '客户名称'],
  whatsapp: ['Whatsapp號碼（需加上區號）', 'WhatsApp', 'Whatsapp'],
  mobilePhone: ['手提電話', '手機', '手机'],
  contactPhone: ['聯絡電話', '联络电话'],
  email: ['電郵', '郵箱', '邮箱'],
  fax: ['傳真', '传真'],
  address: ['通訊地址', '地址'],
  idCardNo: ['身份證號碼', '身份證號', '身份证号码', '身份证号'],
  idCardImage: ['身份證圖片', '身份證副本', '身份证图片', '身份证副本'],
  addressProofCopy: ['住址証明副本', '地址證明副本', '住址证明副本', '地址证明副本'],
  remark: ['備注', '備註', '备注'],
  createdBy: ['創建人', '创建人'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
  updatedBy: ['更新人'],
  updatedAt: ['更新時間', '更新时间', 'Updated At'],
}

export function occupantToIoRow(
  o: OccupantRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: OccupantIoFieldKey) => fieldHeader(key, t)
  return {
    [h('name')]: o.name,
    [h('customerCode')]: o.customerCode || '',
    [h('relatedCustomerName')]: o.relatedCustomerName || o.customerName || '',
    [h('whatsapp')]: o.whatsapp || '',
    [h('mobilePhone')]: o.mobilePhone || '',
    [h('contactPhone')]: o.contactPhone || '',
    [h('email')]: o.email || '',
    [h('fax')]: o.fax || '',
    [h('address')]: o.address || '',
    [h('idCardNo')]: o.idCardNo || '',
    [h('idCardImage')]: o.idCardImage || '',
    [h('addressProofCopy')]: o.addressProofCopy || '',
    [h('remark')]: o.remark || '',
    [h('createdBy')]: o.createdBy || '',
    [h('createdAt')]: o.createdAt || '',
    [h('updatedBy')]: o.updatedBy || '',
    [h('updatedAt')]: o.updatedAt || '',
  }
}

export function occupantIoTemplateExampleRow(t: Translate): Record<string, string | number> {
  const h = (key: OccupantIoFieldKey) => fieldHeader(key, t)
  return {
    [h('name')]: 'Sample Occupant',
    [h('customerCode')]: 'CSM260001',
    [h('relatedCustomerName')]: 'Sample Customer',
    [h('whatsapp')]: '',
    [h('mobilePhone')]: '',
    [h('contactPhone')]: '',
    [h('email')]: '',
    [h('fax')]: '',
    [h('address')]: '',
    [h('idCardNo')]: '',
    [h('idCardImage')]: '',
    [h('addressProofCopy')]: '',
    [h('remark')]: '',
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

export function pickOccupantIoValue(
  row: Record<string, unknown>,
  key: OccupantIoFieldKey,
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

export type OccupantIoPayload = {
  name: string
  customerCode: string
  relatedCustomerName: string
  whatsapp: string
  mobilePhone: string
  contactPhone: string
  email: string
  fax: string
  address: string
  idCardNo: string
  idCardImage: string
  addressProofCopy: string
  remark: string
}

export function rowToOccupantIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): OccupantIoPayload | null {
  const name = pickOccupantIoValue(row, 'name', t)
  if (!name) return null
  return {
    name,
    customerCode: pickOccupantIoValue(row, 'customerCode', t),
    relatedCustomerName: pickOccupantIoValue(row, 'relatedCustomerName', t),
    whatsapp: pickOccupantIoValue(row, 'whatsapp', t),
    mobilePhone: pickOccupantIoValue(row, 'mobilePhone', t),
    contactPhone: pickOccupantIoValue(row, 'contactPhone', t),
    email: pickOccupantIoValue(row, 'email', t),
    fax: pickOccupantIoValue(row, 'fax', t),
    address: pickOccupantIoValue(row, 'address', t),
    idCardNo: pickOccupantIoValue(row, 'idCardNo', t),
    idCardImage: pickOccupantIoValue(row, 'idCardImage', t),
    addressProofCopy: pickOccupantIoValue(row, 'addressProofCopy', t),
    remark: pickOccupantIoValue(row, 'remark', t),
  }
}

/** 去重键：身份证优先；否则 客户编号+姓名；否则 姓名+手机（无客户编号时） */
export function occupantDupKeys(o: {
  name: string
  customerCode?: string | null
  idCardNo?: string | null
  mobilePhone?: string | null
}): string[] {
  const keys: string[] = []
  const id = (o.idCardNo || '').trim().toLowerCase()
  if (id) keys.push(`id:${id}`)
  const code = (o.customerCode || '').trim().toLowerCase()
  const name = (o.name || '').trim().toLowerCase()
  if (code && name) keys.push(`cn:${code}|${name}`)
  const mobile = (o.mobilePhone || '').replace(/[\s\-()]/g, '').toLowerCase()
  if (!code && name && mobile) keys.push(`nm:${name}|${mobile}`)
  return keys
}

export function isOccupantDuplicate(
  candidate: {
    name: string
    customerCode?: string | null
    idCardNo?: string | null
    mobilePhone?: string | null
  },
  seenKeys: Set<string>,
): boolean {
  const keys = occupantDupKeys(candidate)
  if (!keys.length) return false
  return keys.some((k) => seenKeys.has(k))
}

export function registerOccupantDupKeys(
  candidate: {
    name: string
    customerCode?: string | null
    idCardNo?: string | null
    mobilePhone?: string | null
  },
  seenKeys: Set<string>,
) {
  for (const k of occupantDupKeys(candidate)) seenKeys.add(k)
}
