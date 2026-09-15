import request from './request'
import type { CustomerRequirementRecord } from '@/types/customer-requirement'
import type { PaginatedResult } from '@/types/pagination'

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

export type CustomerRequirementListQuery = {
  keyword?: string
  status?: string
  statuses?: string[]
  customerId?: string
  customerNames?: string[]
  salesManagers?: string[]
  sizeConfigLabels?: string[]
  acConfigLabels?: string[]
  windowConfigLabels?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  requirementDateFrom?: string
  requirementDateTo?: string
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
}

export type CustomerRequirementListPage = PaginatedResult<CustomerRequirementRecord>

export function fetchCustomerRequirements(params?: CustomerRequirementListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.status) query.status = params.status
  if (params?.statuses?.length) query.statuses = params.statuses.join(',')
  if (params?.customerId) query.customerId = params.customerId
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.salesManagers?.length) query.salesManagers = params.salesManagers.join(',')
  if (params?.sizeConfigLabels?.length) query.sizeConfigLabels = params.sizeConfigLabels.join(',')
  if (params?.acConfigLabels?.length) query.acConfigLabels = params.acConfigLabels.join(',')
  if (params?.windowConfigLabels?.length) {
    query.windowConfigLabels = params.windowConfigLabels.join(',')
  }
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.requirementDateFrom) query.requirementDateFrom = params.requirementDateFrom
  if (params?.requirementDateTo) query.requirementDateTo = params.requirementDateTo
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<CustomerRequirementListPage>('/customer-requirements', {
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

export function batchDeleteCustomerRequirementsApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/customer-requirements/batch-delete',
    { ids },
  )
}

export type ImportBatchResult = {
  created: number
  updated: number
  skipped: number
  failed: number
  unlinked?: number
  issues?: Array<{
    status: 'skipped' | 'unlinked' | 'failed'
    reason: string
    keys?: Record<string, string>
  }>
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
