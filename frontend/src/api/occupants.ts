import request from './request'
import type { OccupantRecord } from '@/types/customer'
import type { ImportBatchResult } from './customers'

export function fetchOccupants(params?: {
  keyword?: string
  customerId?: string
  limit?: number
  lite?: boolean
}) {
  const query: Record<string, string> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.customerId) query.customerId = params.customerId
  if (params?.limit != null) query.limit = String(params.limit)
  if (params?.lite) query.lite = '1'
  return request.get<OccupantRecord[]>('/occupants', {
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
