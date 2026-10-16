import request from './request'
import type { BuildingRecord } from '@/types/building'
import type { ImportBatchResult } from './customers'
import type { PaginatedResult } from '@/types/pagination'

export type BuildingWritePayload = {
  name: string
  address?: string
  addressEn?: string
  manager?: string
  managerPhone?: string
  email?: string
  workingHours?: string
  fpsId?: string
  bankAccountHolder?: string
  bankAccount?: string
  apiTemplateSuffix?: string
  useWbaNumber?: string
  chequePaymentBy?: string
  paymentAdvice?: string
  agreementTemplateId?: string | null
  invoiceTemplateId?: string | null
  receiptTemplateId?: string | null
  active?: boolean
}

export type BuildingListQuery = {
  keyword?: string
  activeOnly?: boolean
  managers?: string[]
  active?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  createdAtFrom?: string
  createdAtTo?: string
  updatedAtFrom?: string
  updatedAtTo?: string
  page?: number
  pageSize?: number
}

export type BuildingListPage = PaginatedResult<BuildingRecord>

export function fetchBuildings(params?: BuildingListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.activeOnly === true) query.activeOnly = 'true'
  if (params?.activeOnly === false) query.activeOnly = 'false'
  if (params?.managers?.length) query.managers = params.managers.join(',')
  if (params?.active?.length) query.active = params.active.join(',')
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.updatedAtFrom) query.updatedAtFrom = params.updatedAtFrom
  if (params?.updatedAtTo) query.updatedAtTo = params.updatedAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<BuildingListPage>('/buildings', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchBuilding(id: string) {
  return request.get<BuildingRecord>(`/buildings/${id}`)
}

export function createBuildingApi(payload: BuildingWritePayload) {
  return request.post<BuildingRecord>('/buildings', payload)
}

export function updateBuildingApi(id: string, payload: Partial<BuildingWritePayload>) {
  return request.patch<BuildingRecord>(`/buildings/${id}`, payload)
}

export function deleteBuildingApi(id: string) {
  return request.delete<{ success: boolean }>(`/buildings/${id}`)
}

export function batchDeleteBuildingsApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/buildings/batch-delete',
    { ids },
  )
}

export function importBuildingsApi(items: BuildingWritePayload[]) {
  return request.post<ImportBatchResult>('/buildings/import', { items })
}
