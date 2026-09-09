import request from './request'
import type { RoomRecord, RoomStatus } from '@/types/room'

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
