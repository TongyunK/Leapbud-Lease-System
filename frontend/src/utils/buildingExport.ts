import type { BuildingRecord } from '@/types/building'

export const BUILDING_IO_FIELD_KEYS = [
  'name',
  'address',
  'addressEn',
  'manager',
  'managerPhone',
  'email',
  'workingHours',
  'fpsId',
  'bankAccountHolder',
  'bankAccount',
  'apiTemplateSuffix',
  'useWbaNumber',
  'chequePaymentBy',
  'paymentAdvice',
  'active',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
] as const

export type BuildingIoFieldKey = (typeof BUILDING_IO_FIELD_KEYS)[number]

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: BuildingIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt' || key === 'updatedBy' || key === 'updatedAt') {
    return t(`common.${key}`)
  }
  return t(`building.fields.${key}`)
}

const HEADER_ALIASES: Record<BuildingIoFieldKey, string[]> = {
  name: ['大廈名稱', '大厦名称', '大廈', '大厦', '名稱', '名称', 'Building Name', 'Building'],
  address: ['地址', '地址（中文）', '中文地址', 'Address'],
  addressEn: ['地址（英文）', '英文地址', 'Address EN', 'Address (EN)'],
  manager: ['負責人', '负责人', '經理', '经理', 'Manager'],
  managerPhone: ['負責人電話', '负责人电话', '電話', '电话', 'Phone'],
  email: ['電郵', '郵箱', '邮箱', 'Email'],
  workingHours: ['工作時間', '工作时间', '營業時間', '营业时间'],
  fpsId: ['FPS', 'FPS ID', 'FPS_ID', '轉數快', '轉數快編號', '转数快编号'],
  bankAccountHolder: ['銀行戶名', '银行户名', '戶主', '户主'],
  bankAccount: ['銀行帳戶', '银行账户', '帳戶', '账户'],
  apiTemplateSuffix: ['API模板後綴', 'API模板后缀'],
  useWbaNumber: ['WBA_NUMBER', '使用WBA'],
  chequePaymentBy: ['Cheque Payment By', '支票付款說明', '支票付款说明', '支票抬頭', '支票抬头'],
  paymentAdvice: ['Payment Advice', '付款通知', '付款提示'],
  active: ['狀態', '状态', '啟用', '启用'],
  createdBy: ['創建人', '创建人'],
  createdAt: ['創建時間', '创建时间'],
  updatedBy: ['更新人'],
  updatedAt: ['更新時間', '更新时间'],
}

export function buildingToIoRow(
  b: BuildingRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: BuildingIoFieldKey) => fieldHeader(key, t)
  return {
    [h('name')]: b.name,
    [h('address')]: b.address || '',
    [h('addressEn')]: b.addressEn || '',
    [h('manager')]: b.manager || '',
    [h('managerPhone')]: b.managerPhone || '',
    [h('email')]: b.email || '',
    [h('workingHours')]: b.workingHours || '',
    [h('fpsId')]: b.fpsId || '',
    [h('bankAccountHolder')]: b.bankAccountHolder || '',
    [h('bankAccount')]: b.bankAccount || '',
    [h('apiTemplateSuffix')]: b.apiTemplateSuffix || '',
    [h('useWbaNumber')]: b.useWbaNumber || '',
    [h('chequePaymentBy')]: b.chequePaymentBy || '',
    [h('paymentAdvice')]: b.paymentAdvice || '',
    [h('active')]: b.active ? t('user.status.active') : t('user.status.disabled'),
    [h('createdBy')]: b.createdBy || '',
    [h('createdAt')]: b.createdAt || '',
    [h('updatedBy')]: b.updatedBy || '',
    [h('updatedAt')]: b.updatedAt || '',
  }
}

export function buildingIoTemplateExampleRow(t: Translate): Record<string, string | number> {
  const h = (key: BuildingIoFieldKey) => fieldHeader(key, t)
  return {
    [h('name')]: '環薈中心',
    [h('address')]: '',
    [h('addressEn')]: '',
    [h('manager')]: '',
    [h('managerPhone')]: '',
    [h('email')]: '',
    [h('workingHours')]: '',
    [h('fpsId')]: '',
    [h('bankAccountHolder')]: '',
    [h('bankAccount')]: '',
    [h('apiTemplateSuffix')]: '',
    [h('useWbaNumber')]: '',
    [h('chequePaymentBy')]: '',
    [h('paymentAdvice')]: '',
    [h('active')]: t('user.status.active'),
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

export function pickBuildingIoValue(
  row: Record<string, unknown>,
  key: BuildingIoFieldKey,
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

function parseActive(raw: string, t: Translate): boolean {
  const v = raw.trim().toLowerCase()
  if (!v) return true
  if (['0', 'false', 'no', 'n', '停用', '禁用', 'disabled', 'inactive'].includes(v)) {
    return false
  }
  if (
    v === t('user.status.disabled').toLowerCase() ||
    v === t('user.status.disabled')
  ) {
    return false
  }
  return true
}

export type BuildingIoPayload = {
  name: string
  address: string
  addressEn: string
  manager: string
  managerPhone: string
  email: string
  workingHours: string
  fpsId: string
  bankAccountHolder: string
  bankAccount: string
  apiTemplateSuffix: string
  useWbaNumber: string
  chequePaymentBy: string
  paymentAdvice: string
  active: boolean
}

export function rowToBuildingIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): BuildingIoPayload | null {
  const name = pickBuildingIoValue(row, 'name', t)
  if (!name) return null
  return {
    name,
    address: pickBuildingIoValue(row, 'address', t),
    addressEn: pickBuildingIoValue(row, 'addressEn', t),
    manager: pickBuildingIoValue(row, 'manager', t),
    managerPhone: pickBuildingIoValue(row, 'managerPhone', t),
    email: pickBuildingIoValue(row, 'email', t),
    workingHours: pickBuildingIoValue(row, 'workingHours', t),
    fpsId: pickBuildingIoValue(row, 'fpsId', t),
    bankAccountHolder: pickBuildingIoValue(row, 'bankAccountHolder', t),
    bankAccount: pickBuildingIoValue(row, 'bankAccount', t),
    apiTemplateSuffix: pickBuildingIoValue(row, 'apiTemplateSuffix', t),
    useWbaNumber: pickBuildingIoValue(row, 'useWbaNumber', t),
    chequePaymentBy: pickBuildingIoValue(row, 'chequePaymentBy', t),
    paymentAdvice: pickBuildingIoValue(row, 'paymentAdvice', t),
    active: parseActive(pickBuildingIoValue(row, 'active', t), t),
  }
}
