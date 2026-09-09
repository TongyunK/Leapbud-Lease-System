export type RoomTypeTone = 'office' | 'meeting' | 'desk' | 'studio' | 'other'

export interface RoomTypeOption {
  id: string
  label: string
  tone: RoomTypeTone | string
  hint: string
  sortOrder: number
  active: boolean
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}
