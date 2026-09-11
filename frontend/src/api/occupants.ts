import request from './request'
import type { OccupantRecord } from '@/types/customer'
import type { ImportBatchResult } from './customers'
import type { PaginatedResult } from '@/types/pagination'

export type OccupantListQuery = {
  keyword?: string
  customerId?: string
  customerNames?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
  /** @deprecated 兼容旧调用；等同 pageSize */
  limit?: number
  lite?: boolean
}

export type OccupantListPage = PaginatedResult<OccupantRecord>

export function fetchOccupants(params?: OccupantListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.customerId) query.customerId = params.customerId
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  else if (params?.limit != null) query.pageSize = params.limit
  if (params?.lite) query.lite = '1'
  return request.get<OccupantListPage>('/occupants', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchOccupant(id: string) {
  return request.get<OccupantRecord>(`/occupants/${id}`)
}

export type OccupantWritePayload = Partial<
  Omit<
    OccupantRecord,
    'id' | 'customerName' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
  >
> & { name: string }

export function createOccupantApi(payload: OccupantWritePayload) {
  return request.post<OccupantRecord>('/occupants', payload)
}

export function updateOccupantApi(id: string, payload: Partial<OccupantWritePayload>) {
  return request.patch<OccupantRecord>(`/occupants/${id}`, payload)
}

export function deleteOccupantApi(id: string) {
  return request.delete<{ success: boolean }>(`/occupants/${id}`)
}

export function importOccupantsApi(items: OccupantWritePayload[]) {
  return request.post<ImportBatchResult>('/occupants/import', { items })
}
