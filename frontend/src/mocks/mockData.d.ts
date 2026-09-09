import type { BuildingRecord } from '@/types/building'
import type { RoomRecord } from '@/types/room'

export function createMockUser(opts?: {
  account?: string
  displayName?: string
  role?: string
}): {
  id: string
  account: string
  displayName: string
  role: string
}

export function createMockToken(): string

export function getMockBuildings(): BuildingRecord[]
export function getMockRooms(): RoomRecord[]
export function getMockBuildingById(id: string): BuildingRecord | null
export function getMockRoomsByBuildingId(buildingId: string): RoomRecord[]
