import request from './request'
import type { RoomConfigOption, RoomConfigType } from '@/types/room-config'

export function fetchRoomConfigs(params?: { type?: RoomConfigType; activeOnly?: boolean }) {
  const query: Record<string, string> = {}
  if (params?.type) query.type = params.type
  if (params?.activeOnly === false) query.activeOnly = 'false'
  return request.get<RoomConfigOption[]>('/room-configs', { params: query })
}

export function createRoomConfigApi(payload: {
  type: RoomConfigType
  label?: string
  minSqft?: number | null
  maxSqft?: number | null
  brand?: string
  model?: string
  sortOrder?: number
  active?: boolean
}) {
  return request.post<RoomConfigOption>('/room-configs', payload)
}

export function updateRoomConfigApi(
  id: string,
  payload: {
    label?: string
    minSqft?: number | null
    maxSqft?: number | null
    brand?: string
    model?: string
    sortOrder?: number
    active?: boolean
  },
) {
  return request.patch<RoomConfigOption>(`/room-configs/${id}`, payload)
}

export function deleteRoomConfigApi(id: string) {
  return request.delete<{ success: boolean }>(`/room-configs/${id}`)
}

export function batchDeleteRoomConfigsApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/room-configs/batch-delete',
    { ids },
  )
}

/** 按呎数匹配尺寸区间（含下界、不含上界；无上界则 ≥min；无下界则 <max） */
export function matchSizeOption(
  options: RoomConfigOption[],
  sizeSqft: number,
): RoomConfigOption | undefined {
  const list = options.filter((o) => o.type === 'size' && o.active)
  return list.find((o) => {
    const min = o.minSqft
    const max = o.maxSqft
    if (min != null && max != null) return sizeSqft >= min && sizeSqft < max
    if (min != null && max == null) return sizeSqft >= min
    if (min == null && max != null) return sizeSqft < max
    return false
  })
}
