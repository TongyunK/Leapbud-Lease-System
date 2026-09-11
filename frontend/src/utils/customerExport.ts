import type { CustomerRecord } from '@/types/customer'

/** 客户导入/导出字段（联络信息来自主要使用者） */
export const CUSTOMER_IO_FIELD_KEYS = [
  'customerCode',
  'name',
  'status',
  'accountManager',
  'companyNameZh',
  'companyNameEn',
  'businessRegNo',
  'businessNature',
  'primaryContact',
  'whatsapp',
  'mobilePhone',
  'contactPhone',
  'email',
  'fax',
  'address',
  'idCardNo',
  'idCardImage',
  'businessRegCopy',
  'addressProofCopy',
  'remark',
  'source',
  'rentedRooms',
  'buildingName',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
] as const

export type CustomerIoFieldKey = (typeof CUSTOMER_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: CustomerIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt' || key === 'updatedBy' || key === 'updatedAt') {
    return t(`common.${key}`)
  }
  if (
    key === 'primaryContact' ||
    key === 'whatsapp' ||
    key === 'mobilePhone' ||
    key === 'contactPhone' ||
    key === 'email' ||
    key === 'fax' ||
    key === 'address' ||
    key === 'idCardNo' ||
    key === 'idCardImage' ||
    key === 'addressProofCopy'
  ) {
    // 导出仍用客户字段文案；导入会映射到 occupant
    return t(`customer.fields.${key}`)
  }
  return t(`customer.fields.${key}`)
}

const HEADER_ALIASES: Record<CustomerIoFieldKey, string[]> = {
  customerCode: ['客戶編號', '客户编号'],
  name: ['客戶名稱', '客户名称'],
  status: ['狀態', '状态'],
  accountManager: ['客戶經理', '客户经理', '結售經理', '结售经理'],
  companyNameZh: ['公司名稱（中文）', '公司名稱（中）', '公司名称（中文）', '公司名称（中）'],
  companyNameEn: ['公司名稱（英文）', '公司名稱（英）', '公司名称（英文）', '公司名称（英）'],
  businessRegNo: ['商業登記號碼', '商業登記號', '商业登记号码', '商业登记号'],
  businessNature: ['業務性質', '业务性质'],
  primaryContact: ['主要聯絡人', '主要联络人', '使用者姓名', '使用者名稱'],
  whatsapp: ['Whatsapp號碼（需加上區號）', 'WhatsApp', 'Whatsapp'],
  mobilePhone: ['手提電話', '手機', '手机'],
  contactPhone: ['聯絡電話', '联络电话'],
  email: ['電郵', '郵箱', '邮箱'],
  fax: ['傳真', '传真'],
  address: ['通訊地址', '地址'],
  idCardNo: ['身份證號碼', '身份證號', '身份证号码', '身份证号'],
  idCardImage: ['身份證圖片', '身份證副本', '身份证图片', '身份证副本'],
  businessRegCopy: ['商業登記副本', '商业登记副本'],
  addressProofCopy: ['住址証明副本', '地址證明副本', '住址证明副本', '地址证明副本'],
  remark: ['備注', '備註', '备注'],
  source: ['客戶來源', '來源', '客户来源', '来源'],
  rentedRooms: ['在租房間', '租用房間', '在租房间', '租用房间'],
  buildingName: ['所屬大廈', '大廈', '所属大厦', '大厦'],
  createdBy: ['創建人', '创建人'],
  createdAt: ['創建時間', '创建时间', 'Created At'],
  updatedBy: ['更新人'],
  updatedAt: ['更新時間', '更新时间', 'Updated At'],
}

export function customerToIoRow(
  c: CustomerRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: CustomerIoFieldKey) => fieldHeader(key, t)
  const o = c.primaryOccupant
  return {
    [h('customerCode')]: c.customerCode,
    [h('name')]: c.name,
    [h('status')]: c.status || '',
    [h('accountManager')]: c.accountManager || '',
    [h('companyNameZh')]: c.companyNameZh || '',
    [h('companyNameEn')]: c.companyNameEn || '',
    [h('businessRegNo')]: c.businessRegNo || '',
    [h('businessNature')]: c.businessNature || '',
    [h('primaryContact')]: o?.name || c.primaryContact || '',
    [h('whatsapp')]: o?.whatsapp || '',
    [h('mobilePhone')]: o?.mobilePhone || c.mobilePhone || '',
    [h('contactPhone')]: o?.contactPhone || '',
    [h('email')]: o?.email || '',
    [h('fax')]: o?.fax || '',
    [h('address')]: o?.address || '',
    [h('idCardNo')]: o?.idCardNo || '',
    [h('idCardImage')]: o?.idCardImage || '',
    [h('businessRegCopy')]: c.businessRegCopy || '',
    [h('addressProofCopy')]: o?.addressProofCopy || '',
    [h('remark')]: c.remark || '',
    [h('source')]: c.source || '',
    [h('rentedRooms')]: c.rentedRooms || '',
    [h('buildingName')]: c.buildingName || '',
    [h('createdBy')]: c.createdBy || '',
    [h('createdAt')]: c.createdAt || '',
    [h('updatedBy')]: c.updatedBy || '',
    [h('updatedAt')]: c.updatedAt || '',
  }
}

export function customerIoTemplateExampleRow(t: Translate): Record<string, string | number> {
  const h = (key: CustomerIoFieldKey) => fieldHeader(key, t)
  return {
    [h('customerCode')]: 'CSM260001',
    [h('name')]: 'Sample Customer',
    [h('status')]: '新客戶',
    [h('accountManager')]: '',
    [h('companyNameZh')]: '',
    [h('companyNameEn')]: '',
    [h('businessRegNo')]: '',
    [h('businessNature')]: '',
    [h('primaryContact')]: 'Sample Occupant',
    [h('whatsapp')]: '',
    [h('mobilePhone')]: '',
    [h('contactPhone')]: '',
    [h('email')]: '',
    [h('fax')]: '',
    [h('address')]: '',
    [h('idCardNo')]: '',
    [h('idCardImage')]: '',
    [h('businessRegCopy')]: '',
    [h('addressProofCopy')]: '',
    [h('remark')]: '',
    [h('source')]: '',
    [h('rentedRooms')]: '',
    [h('buildingName')]: '',
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

export function pickCustomerIoValue(
  row: Record<string, unknown>,
  key: CustomerIoFieldKey,
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

export type CustomerIoPayload = {
  /** 可为空；后端自动生成 */
  customerCode: string
  name: string
  status: string
  accountManagerLabel: string
  companyNameZh: string
  companyNameEn: string
  businessRegNo: string
  businessNature: string
  businessRegCopy: string
  remark: string
  source: string
  rentedRooms: string
  buildingName: string
  occupant: {
    name: string
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
  } | null
}

export function rowToCustomerIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): CustomerIoPayload | null {
  const customerCode = pickCustomerIoValue(row, 'customerCode', t)
  const name = pickCustomerIoValue(row, 'name', t)
  if (!name) return null
  const occupantName = pickCustomerIoValue(row, 'primaryContact', t)
  return {
    customerCode,
    name,
    status: pickCustomerIoValue(row, 'status', t) || '新客戶',
    accountManagerLabel: pickCustomerIoValue(row, 'accountManager', t),
    companyNameZh: pickCustomerIoValue(row, 'companyNameZh', t),
    companyNameEn: pickCustomerIoValue(row, 'companyNameEn', t),
    businessRegNo: pickCustomerIoValue(row, 'businessRegNo', t),
    businessNature: pickCustomerIoValue(row, 'businessNature', t),
    businessRegCopy: pickCustomerIoValue(row, 'businessRegCopy', t),
    remark: pickCustomerIoValue(row, 'remark', t),
    source: pickCustomerIoValue(row, 'source', t),
    rentedRooms: pickCustomerIoValue(row, 'rentedRooms', t),
    buildingName: pickCustomerIoValue(row, 'buildingName', t),
    occupant: occupantName
      ? {
          name: occupantName,
          whatsapp: pickCustomerIoValue(row, 'whatsapp', t),
          mobilePhone: pickCustomerIoValue(row, 'mobilePhone', t),
          contactPhone: pickCustomerIoValue(row, 'contactPhone', t),
          email: pickCustomerIoValue(row, 'email', t),
          fax: pickCustomerIoValue(row, 'fax', t),
          address: pickCustomerIoValue(row, 'address', t),
          idCardNo: pickCustomerIoValue(row, 'idCardNo', t),
          idCardImage: pickCustomerIoValue(row, 'idCardImage', t),
          addressProofCopy: pickCustomerIoValue(row, 'addressProofCopy', t),
          remark: '',
        }
      : null,
  }
}
