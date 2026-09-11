import type { RoomRecord, RoomStatus } from '@/types/room'

/** 房間導入/導出欄位（兼容舊系統「房間信息」表頭） */
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

type Translate = (key: string, values?: Record<string, unknown>) => string

function fieldHeader(key: RoomIoFieldKey, t: Translate): string {
  if (key === 'createdBy' || key === 'createdAt' || key === 'updatedBy' || key === 'updatedAt') {
    return t(`common.${key}`)
  }
  return t(`room.fields.${key}`)
}

const HEADER_ALIASES: Record<RoomIoFieldKey, string[]> = {
  roomCode: ['房間編號', '房间编号', '編號', '编号', '房號', '房号', 'Room No', 'Room Code', 'RoomNumber'],
  name: ['房間名稱', '房间名称', '名稱', '名称', 'Room Name'],
  roomType: ['房間類型', '房间类型', '類型', '类型', 'Room Type'],
  building: ['所屬大廈', '所属大厦', '大廈', '大厦', '大廈名稱', '大厦名称', 'Building', 'Building Name'],
  status: ['狀態', '状态', 'Status'],
  serialNo: ['流水號', '流水号', '內部序號', '内部序号'],
  monthlyRent: ['月租', '租金/月', 'Monthly Rent'],
  dailyRent: ['日租'],
  hourlyRent: ['時租', '时租'],
  sizeSqft: ['房間呎寸', '房间呎寸', '呎寸', '呎數', '呎数', '面積', '面积'],
  windowConfig: ['窗', '窗戶', '窗户', '窗戶配置', '窗户配置'],
  acConfig: ['空調', '空调', '空調配置', '空调配置'],
  subleaseMark: ['分租符', '分租', '分租符號', '分租符号'],
  description: ['房間描述', '房间描述', '描述'],
  remark: ['備注', '備註', '备注'],
  latestContract: ['最新合約', '最新合约'],
  createdBy: ['創建人', '创建人'],
  createdAt: ['創建時間', '创建时间'],
  updatedBy: ['更新人'],
  updatedAt: ['更新時間', '更新时间'],
}

export function roomToIoRow(
  r: RoomRecord,
  t: Translate,
): Record<string, string | number> {
  const h = (key: RoomIoFieldKey) => fieldHeader(key, t)
  return {
    [h('roomCode')]: r.roomCode,
    [h('name')]: r.name,
    [h('roomType')]: r.roomType,
    [h('building')]: r.buildingName,
    [h('status')]: t(`room.status.${r.status}`),
    [h('serialNo')]: r.serialNo || '',
    [h('monthlyRent')]: r.monthlyRent,
    [h('dailyRent')]: r.dailyRent,
    [h('hourlyRent')]: r.hourlyRent,
    [h('sizeSqft')]: r.sizeSqft,
    [h('windowConfig')]: r.windowConfig || '',
    [h('acConfig')]: r.acConfig || '',
    [h('subleaseMark')]: r.subleaseMark || '',
    [h('description')]: r.description || '',
    [h('remark')]: r.remark || '',
    [h('latestContract')]: r.latestContract || '',
    [h('createdBy')]: r.createdBy || '',
    [h('createdAt')]: r.createdAt || '',
    [h('updatedBy')]: r.updatedBy || '',
    [h('updatedAt')]: r.updatedAt || '',
  }
}

export function roomIoTemplateExampleRow(t: Translate): Record<string, string | number> {
  const h = (key: RoomIoFieldKey) => fieldHeader(key, t)
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

function cellNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

export function pickRoomIoValue(
  row: Record<string, unknown>,
  key: RoomIoFieldKey,
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

function pickRoomIoRaw(
  row: Record<string, unknown>,
  key: RoomIoFieldKey,
  t: Translate,
): unknown {
  const headers = [fieldHeader(key, t), ...(HEADER_ALIASES[key] || [])]
  for (const h of headers) {
    if (h in row) return row[h]
  }
  const normalized = new Map(
    Object.keys(row).map((k) => [k.replace(/\s+/g, ''), row[k]]),
  )
  for (const h of headers) {
    const hit = normalized.get(h.replace(/\s+/g, ''))
    if (hit !== undefined) return hit
  }
  return ''
}

const STATUS_ALIASES: Record<string, RoomStatus> = {
  idle: 'idle',
  signing: 'signing',
  leased: 'leased',
  terminating: 'terminating',
  閑置中: 'idle',
  闲置中: 'idle',
  簽約中: 'signing',
  签约中: 'signing',
  租賃中: 'leased',
  租赁中: 'leased',
  退租中: 'terminating',
}

export function parseRoomStatus(raw: string, t: Translate): RoomStatus {
  const v = raw.trim()
  if (!v) return 'idle'
  const fromAlias = STATUS_ALIASES[v] || STATUS_ALIASES[v.toLowerCase()]
  if (fromAlias) return fromAlias
  for (const key of ['idle', 'signing', 'leased', 'terminating'] as const) {
    if (t(`room.status.${key}`) === v) return key
  }
  return 'idle'
}

export type RoomIoPayload = {
  roomCode: string
  name: string
  roomType: string
  buildingName: string
  status: RoomStatus
  serialNo: string
  monthlyRent: number
  dailyRent: number
  hourlyRent: number
  sizeSqft: number
  windowConfig: string
  acConfig: string
  subleaseMark: string
  description: string
  remark: string
  latestContract: string
}

export function rowToRoomIoPayload(
  row: Record<string, unknown>,
  t: Translate,
): RoomIoPayload | null {
  const roomCode = pickRoomIoValue(row, 'roomCode', t)
  if (!roomCode) return null
  const name = pickRoomIoValue(row, 'name', t) || roomCode
  return {
    roomCode,
    name,
    roomType: pickRoomIoValue(row, 'roomType', t),
    buildingName: pickRoomIoValue(row, 'building', t),
    status: parseRoomStatus(pickRoomIoValue(row, 'status', t), t),
    serialNo: pickRoomIoValue(row, 'serialNo', t) || roomCode,
    monthlyRent: cellNum(pickRoomIoRaw(row, 'monthlyRent', t)),
    dailyRent: cellNum(pickRoomIoRaw(row, 'dailyRent', t)),
    hourlyRent: cellNum(pickRoomIoRaw(row, 'hourlyRent', t)),
    sizeSqft: cellNum(pickRoomIoRaw(row, 'sizeSqft', t)),
    windowConfig: pickRoomIoValue(row, 'windowConfig', t),
    acConfig: pickRoomIoValue(row, 'acConfig', t),
    subleaseMark: pickRoomIoValue(row, 'subleaseMark', t),
    description: pickRoomIoValue(row, 'description', t),
    remark: pickRoomIoValue(row, 'remark', t),
    latestContract: pickRoomIoValue(row, 'latestContract', t),
  }
}
