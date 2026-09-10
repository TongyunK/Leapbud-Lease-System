import request from './request'
import type { RoomRecord, RoomStatus } from '@/types/room'
import type { ImportBatchResult } from './customers'

export type RoomWritePayload = {
  roomCode: string
  name: string
  roomType?: string
  buildingId?: string
  buildingName?: string
  status?: RoomStatus
  serialNo?: string
  monthlyRent?: number
  dailyRent?: number
  hourlyRent?: number
  sizeSqft?: number
  description?: string
  remark?: string
  windowConfig?: string
  acConfig?: string
  latestContract?: string
  subleaseMark?: string
}

export function fetchRooms(params?: {
  keyword?: string
  buildingId?: string
  status?: RoomStatus | ''
}) {
  const query: Record<string, string> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.buildingId) query.buildingId = params.buildingId
  if (params?.status) query.status = params.status
  return request.get<RoomRecord[]>('/rooms', { params: query })
}

export function fetchRoom(id: string) {
  return request.get<RoomRecord>(`/rooms/${id}`)
}

export function createRoomApi(payload: RoomWritePayload) {
  return request.post<RoomRecord>('/rooms', payload)
}

export function updateRoomApi(id: string, payload: Partial<RoomWritePayload>) {
  return request.patch<RoomRecord>(`/rooms/${id}`, payload)
}

export function importRoomsApi(items: RoomWritePayload[]) {
  return request.post<ImportBatchResult>('/rooms/import', { items })
}
