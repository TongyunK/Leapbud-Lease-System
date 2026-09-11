import request from './request'
import type { CustomerRecord } from '@/types/customer'
import type { PaginatedResult } from '@/types/pagination'

export type CustomerOccupantPayload = {
  name: string
  whatsapp?: string
  mobilePhone?: string
  contactPhone?: string
  email?: string
  fax?: string
  address?: string
  idCardNo?: string
  idCardImage?: string
  addressProofCopy?: string
  remark?: string
}

export type CustomerWritePayload = {
  /** 留空则后端自动生成 */
  customerCode?: string
  name: string
  status?: string
  accountManagerId?: string | null
  companyNameZh?: string
  companyNameEn?: string
  businessRegNo?: string
  businessNature?: string
  businessRegCopy?: string
  remark?: string
  source?: string
  rentedRooms?: string
  buildingId?: string | null
  linkOccupantId?: string
  primaryOccupantId?: string | null
  occupant?: CustomerOccupantPayload
}

export type CustomerListQuery = {
  keyword?: string
  status?: string
  statuses?: string[]
  accountManagers?: string[]
  buildingNames?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
}

export type CustomerListPage = PaginatedResult<CustomerRecord>

export function fetchCustomers(params?: CustomerListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.status) query.status = params.status
  if (params?.statuses?.length) query.statuses = params.statuses.join(',')
  if (params?.accountManagers?.length) query.accountManagers = params.accountManagers.join(',')
  if (params?.buildingNames?.length) query.buildingNames = params.buildingNames.join(',')
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<CustomerListPage>('/customers', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchCustomer(id: string) {
  return request.get<CustomerRecord>(`/customers/${id}`)
}

export function createCustomerApi(payload: CustomerWritePayload) {
  return request.post<CustomerRecord>('/customers', payload)
}

export function updateCustomerApi(id: string, payload: Partial<CustomerWritePayload>) {
  return request.patch<CustomerRecord>(`/customers/${id}`, payload)
}

export function deleteCustomerApi(id: string) {
  return request.delete<{ success: boolean }>(`/customers/${id}`)
}

export type ImportBatchResult = {
  created: number
  updated: number
  skipped: number
  failed: number
  unlinked?: number
}

export function importCustomersApi(items: CustomerWritePayload[]) {
  return request.post<ImportBatchResult>('/customers/import', { items })
}
