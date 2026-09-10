import request from './request'
import type { CustomerRecord } from '@/types/customer'

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
  customerCode: string
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

export function fetchCustomers(params?: { keyword?: string; status?: string }) {
  const query: Record<string, string> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.status) query.status = params.status
  return request.get<CustomerRecord[]>('/customers', {
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
