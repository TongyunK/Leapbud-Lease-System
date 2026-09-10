export type StatusTone =
  | 'idle'
  | 'signing'
  | 'contracting'
  | 'leased'
  | 'leasing'
  | 'terminating'
  | 'active'
  | 'disabled'
  | 'neutral'

const ROOM_STATUS_TONES = {
  idle: 'idle',
  signing: 'signing',
  leased: 'leased',
  terminating: 'terminating',
} as const

const USER_STATUS_TONES = {
  active: 'active',
  disabled: 'disabled',
} as const

export function roomStatusTone(status: string | null | undefined): StatusTone {
  const key = (status || '') as keyof typeof ROOM_STATUS_TONES
  return ROOM_STATUS_TONES[key] || 'neutral'
}

export function userStatusTone(status: string | null | undefined): StatusTone {
  const key = (status || '') as keyof typeof USER_STATUS_TONES
  return USER_STATUS_TONES[key] || 'neutral'
}

/** 客户状态色：绿 / 橙 / 深蓝 / 浅蓝 / 红 / 红 */
const CUSTOMER_STATUS_TONES: Record<string, StatusTone> = {
  新客戶: 'idle',
  已查詢: 'signing',
  簽約中: 'contracting',
  租賃中: 'leasing',
  退租中: 'terminating',
  已退租: 'terminating',
}

export function customerStatusTone(status: string | null | undefined): StatusTone {
  const key = (status || '').trim()
  return CUSTOMER_STATUS_TONES[key] || 'neutral'
}
