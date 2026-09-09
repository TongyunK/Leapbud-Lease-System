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
  'buildingConfig',
  'chequePaymentBy',
  'paymentAdvice',
  'active',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
] as const

export type BuildingIoFieldKey = (typeof BUILDING_IO_FIELD_KEYS)[number]

export function buildingToIoRow(
  b: BuildingRecord,
  t: (key: string, values?: Record<string, unknown>) => string,
): Record<string, string | number> {
  const h = (key: BuildingIoFieldKey) =>
    key === 'createdBy' || key === 'createdAt' || key === 'updatedBy' || key === 'updatedAt'
      ? t(`common.${key}`)
      : t(`building.fields.${key}`)

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
    [h('buildingConfig')]: b.buildingConfig || '',
    [h('chequePaymentBy')]: b.chequePaymentBy || '',
    [h('paymentAdvice')]: b.paymentAdvice || '',
    [h('active')]: b.active ? t('user.status.active') : t('user.status.disabled'),
    [h('createdBy')]: b.createdBy || '',
    [h('createdAt')]: b.createdAt || '',
    [h('updatedBy')]: b.updatedBy || '',
    [h('updatedAt')]: b.updatedAt || '',
  }
}

export function buildingIoTemplateExampleRow(
  t: (key: string, values?: Record<string, unknown>) => string,
): Record<string, string | number> {
  const h = (key: BuildingIoFieldKey) =>
    key === 'createdBy' || key === 'createdAt' || key === 'updatedBy' || key === 'updatedAt'
      ? t(`common.${key}`)
      : t(`building.fields.${key}`)

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
    [h('buildingConfig')]: '',
    [h('chequePaymentBy')]: '',
    [h('paymentAdvice')]: '',
    [h('active')]: t('user.status.active'),
    [h('createdBy')]: '',
    [h('createdAt')]: '',
    [h('updatedBy')]: '',
    [h('updatedAt')]: '',
  }
}
