export type RoomConfigType = 'size' | 'window' | 'ac'

export interface RoomConfigOption {
  id: string
  type: RoomConfigType
  label: string
  minSqft: number | null
  maxSqft: number | null
  brand: string
  model: string
  sortOrder: number
  active: boolean
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}
