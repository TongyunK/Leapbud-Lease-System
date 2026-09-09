export type StatusTone =
  | 'idle'
  | 'signing'
  | 'leased'
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
