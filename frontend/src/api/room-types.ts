import request from './request'
import type { RoomTypeOption, RoomTypeTone } from '@/types/room-type'

export function fetchRoomTypes(params?: { activeOnly?: boolean }) {
  const query: Record<string, string> = {}
  if (params?.activeOnly === false) query.activeOnly = 'false'
  return request.get<RoomTypeOption[]>('/room-types', { params: query })
}

export function createRoomTypeApi(payload: {
  label: string
  tone?: RoomTypeTone | string
  hint?: string
  sortOrder?: number
  active?: boolean
}) {
  return request.post<RoomTypeOption>('/room-types', payload)
}

export function updateRoomTypeApi(
  id: string,
  payload: {
    label?: string
    tone?: RoomTypeTone | string
    hint?: string
    sortOrder?: number
    active?: boolean
  },
) {
  return request.patch<RoomTypeOption>(`/room-types/${id}`, payload)
}

export function deleteRoomTypeApi(id: string) {
  return request.delete<{ success: boolean }>(`/room-types/${id}`)
}

export function batchDeleteRoomTypesApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/room-types/batch-delete',
    { ids },
  )
}
