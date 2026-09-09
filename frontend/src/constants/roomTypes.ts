import type { RoomTypeTone } from '@/types/room-type'

/** 色系选项（管理页下拉） */
export const ROOM_TYPE_TONE_OPTIONS: RoomTypeTone[] = [
  'office',
  'meeting',
  'desk',
  'studio',
  'other',
]

/** 历史/未知标签的本地色系回退 */
const TONE_BY_LABEL: Record<string, RoomTypeTone> = {
  辦公室: 'office',
  办公室: 'office',
  會議室: 'meeting',
  会议室: 'meeting',
  共享工位: 'desk',
  工作室: 'studio',
}

export function roomTypeTone(label: string | null | undefined): RoomTypeTone {
  const key = (label || '').trim()
  if (!key) return 'other'
  return TONE_BY_LABEL[key] || 'other'
}

export function normalizeRoomTypeTone(tone: string | null | undefined, label?: string): RoomTypeTone {
  const t = (tone || '').trim()
  if (ROOM_TYPE_TONE_OPTIONS.includes(t as RoomTypeTone)) return t as RoomTypeTone
  return roomTypeTone(label)
}
