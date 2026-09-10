import request from './request'
import type { BuildingRecord } from '@/types/building'
import type { ImportBatchResult } from './customers'

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
  buildingConfig?: string
  chequePaymentBy?: string
  paymentAdvice?: string
  active?: boolean
}

export function fetchBuildings(params?: { keyword?: string; activeOnly?: boolean }) {
  const query: Record<string, string> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.activeOnly === true) query.activeOnly = 'true'
  if (params?.activeOnly === false) query.activeOnly = 'false'
  return request.get<BuildingRecord[]>('/buildings', {
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

export function importBuildingsApi(items: BuildingWritePayload[]) {
  return request.post<ImportBatchResult>('/buildings/import', { items })
}
