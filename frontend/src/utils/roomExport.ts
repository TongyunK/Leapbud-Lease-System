import type { RoomRecord } from '@/types/room'

/** 房間導入/導出欄位（可與後續業務增減） */
export const ROOM_IO_FIELD_KEYS = [
  'roomCode',
  'name',
  'roomType',
  'building',
  'status',
  'serialNo',
  'monthlyRent',
  'dailyRent',
  'hourlyRent',
  'sizeSqft',
  'windowConfig',
  'acConfig',
  'subleaseMark',
  'description',
  'remark',
  'latestContract',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
] as const

export type RoomIoFieldKey = (typeof ROOM_IO_FIELD_KEYS)[number]

export function roomIoHeaders(
  t: (key: string, values?: Record<string, unknown>) => string,
): string[] {
  return ROOM_IO_FIELD_KEYS.map((key) => t(`room.fields.${key}`))
}

export function roomToIoRow(
  r: RoomRecord,
  t: (key: string, values?: Record<string, unknown>) => string,
): Record<string, string | number> {
  return {
    [t('room.fields.roomCode')]: r.roomCode,
    [t('room.fields.name')]: r.name,
    [t('room.fields.roomType')]: r.roomType,
    [t('room.fields.building')]: r.buildingName,
    [t('room.fields.status')]: t(`room.status.${r.status}`),
    [t('room.fields.serialNo')]: r.serialNo || '',
    [t('room.fields.monthlyRent')]: r.monthlyRent,
    [t('room.fields.dailyRent')]: r.dailyRent,
    [t('room.fields.hourlyRent')]: r.hourlyRent,
    [t('room.fields.sizeSqft')]: r.sizeSqft,
    [t('room.fields.windowConfig')]: r.windowConfig || '',
    [t('room.fields.acConfig')]: r.acConfig || '',
    [t('room.fields.subleaseMark')]: r.subleaseMark || '',
    [t('room.fields.description')]: r.description || '',
    [t('room.fields.remark')]: r.remark || '',
    [t('room.fields.latestContract')]: r.latestContract || '',
    [t('common.createdBy')]: r.createdBy || '',
    [t('common.createdAt')]: r.createdAt || '',
    [t('common.updatedBy')]: r.updatedBy || '',
    [t('common.updatedAt')]: r.updatedAt || '',
  }
}

/** 空模板：表頭 + 一行示例（可刪後填寫） */
export function roomIoTemplateExampleRow(
  t: (key: string, values?: Record<string, unknown>) => string,
): Record<string, string | number> {
  const h = (key: RoomIoFieldKey) => t(`room.fields.${key}`)
  return {
    [h('roomCode')]: 'HH-0901',
    [h('name')]: 'Sample Room',
    [h('roomType')]: '辦公室',
    [h('building')]: '環薈中心',
    [h('status')]: t('room.status.idle'),
    [h('serialNo')]: 'RM-1001',
    [h('monthlyRent')]: 18500,
    [h('dailyRent')]: 900,
    [h('hourlyRent')]: 150,
    [h('sizeSqft')]: 180,
    [h('windowConfig')]: '',
    [h('acConfig')]: '',
    [h('subleaseMark')]: '',
    [h('description')]: '',
    [h('remark')]: '',
    [h('latestContract')]: '',
    [t('common.createdBy')]: '',
    [t('common.createdAt')]: '',
    [t('common.updatedBy')]: '',
    [t('common.updatedAt')]: '',
  }
}
