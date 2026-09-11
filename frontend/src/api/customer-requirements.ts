import request from './request'
import type { CustomerRequirementRecord } from '@/types/customer-requirement'

export type CustomerRequirementWritePayload = {
  requirementCode?: string
  customerId: string
  salesManagerId?: string | null
  requirementDate?: string | null
  status?: string
  leaseDuration?: string
  budget?: number | null
  content?: string
  remark?: string
  attachment?: string
  sizeConfigId?: string | null
  acConfigId?: string | null
  windowConfigId?: string | null
}

export function fetchCustomerRequirements(params?: {
  keyword?: string
  status?: string
  customerId?: string
}) {
  const query: Record<string, string> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.status) query.status = params.status
  if (params?.customerId) query.customerId = params.customerId
  return request.get<CustomerRequirementRecord[]>('/customer-requirements', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchCustomerRequirement(id: string) {
  return request.get<CustomerRequirementRecord>(`/customer-requirements/${id}`)
}

export function createCustomerRequirementApi(payload: CustomerRequirementWritePayload) {
  return request.post<CustomerRequirementRecord>('/customer-requirements', payload)
}

export function updateCustomerRequirementApi(
  id: string,
  payload: Partial<CustomerRequirementWritePayload>,
) {
  return request.patch<CustomerRequirementRecord>(`/customer-requirements/${id}`, payload)
}

export function deleteCustomerRequirementApi(id: string) {
  return request.delete<{ success: boolean }>(`/customer-requirements/${id}`)
}

export type ImportBatchResult = {
  created: number
  updated: number
  skipped: number
  failed: number
  unlinked?: number
}

export type CustomerRequirementImportItem = {
  requirementCode?: string
  customerCode?: string
  customerName?: string
  salesManager?: string
  requirementDate?: string | null
  status?: string
  leaseDuration?: string
  budget?: number | null
  content?: string
  remark?: string
  attachment?: string
  sizeConfig?: string
  acConfig?: string
  windowConfig?: string
}

export function importCustomerRequirementsApi(items: CustomerRequirementImportItem[]) {
  return request.post<ImportBatchResult>('/customer-requirements/import', { items })
}
