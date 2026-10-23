import request from './request'
import type { RoomImageRecord, RoomRecord, RoomStatus } from '@/types/room'
import type { ImportBatchResult } from './customers'
import type { PaginatedResult } from '@/types/pagination'

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
  leaseCapability?: 'whole_only' | 'flexible' | 'part_only'
  splitLabels?: string[]
  splitCount?: number
}

export type RoomListQuery = {
  keyword?: string
  buildingId?: string
  buildingIds?: string[]
  status?: RoomStatus | ''
  statuses?: string[]
  leaseCapability?: 'whole_only' | 'flexible' | 'part_only' | ''
  leaseCapabilities?: string[]
  /** 状态列：idle | whole | partial | full */
  occupancySummaries?: string[]
  roomTypes?: string[]
  sizeRangeIds?: string[]
  windowConfigs?: string[]
  acConfigs?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  createdAtFrom?: string
  createdAtTo?: string
  updatedAtFrom?: string
  updatedAtTo?: string
  page?: number
  pageSize?: number
}

export type RoomLeaseCapabilityCounts = {
  all: number
  flexible: number
  whole_only: number
  part_only: number
}

export type RoomListPage = PaginatedResult<RoomRecord>

export function fetchRooms(params?: RoomListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.buildingId) query.buildingId = params.buildingId
  if (params?.buildingIds?.length) query.buildingIds = params.buildingIds.join(',')
  if (params?.status) query.status = params.status
  if (params?.statuses?.length) query.statuses = params.statuses.join(',')
  if (params?.leaseCapability) query.leaseCapability = params.leaseCapability
  if (params?.leaseCapabilities?.length) {
    query.leaseCapabilities = params.leaseCapabilities.join(',')
  }
  if (params?.occupancySummaries?.length) {
    query.occupancySummaries = params.occupancySummaries.join(',')
  }
  if (params?.roomTypes?.length) query.roomTypes = params.roomTypes.join(',')
  if (params?.sizeRangeIds?.length) query.sizeRangeIds = params.sizeRangeIds.join(',')
  if (params?.windowConfigs?.length) query.windowConfigs = params.windowConfigs.join(',')
  if (params?.acConfigs?.length) query.acConfigs = params.acConfigs.join(',')
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.updatedAtFrom) query.updatedAtFrom = params.updatedAtFrom
  if (params?.updatedAtTo) query.updatedAtTo = params.updatedAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<RoomListPage>('/rooms', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchRoom(id: string) {
  return request.get<RoomRecord>(`/rooms/${id}`)
}

export function fetchRoomLeaseCapabilityCounts() {
  return request.get<RoomLeaseCapabilityCounts>('/rooms/stats/lease-capability')
}

export function createRoomApi(payload: RoomWritePayload) {
  return request.post<RoomRecord>('/rooms', payload)
}

export function updateRoomApi(id: string, payload: Partial<RoomWritePayload>) {
  return request.patch<RoomRecord>(`/rooms/${id}`, payload)
}

export function deleteRoomApi(id: string) {
  return request.delete<{ success: boolean }>(`/rooms/${id}`)
}

export function batchDeleteRoomsApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/rooms/batch-delete',
    { ids },
  )
}

export function importRoomsApi(items: RoomWritePayload[]) {
  return request.post<ImportBatchResult>('/rooms/import', { items })
}

export function uploadRoomImagesApi(roomId: string, files: File[]) {
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  return request.post<RoomImageRecord[]>(`/rooms/${roomId}/images`, fd)
}

export function deleteRoomImageApi(roomId: string, imageId: string) {
  return request.delete<{ success: boolean }>(`/rooms/${roomId}/images/${imageId}`)
}

/** 拉取房间图片二进制（需 JWT），用于 Auth 预览 */
export async function fetchRoomImageBlob(roomId: string, imageId: string) {
  const res = await request.get<Blob>(`/rooms/${roomId}/images/${imageId}/file`, {
    responseType: 'blob',
    silentError: true,
  })
  return res.data
}
