import request from './request'
import type { CustomerSourceOption } from '@/types/customer-source'

export function fetchCustomerSources(params?: { activeOnly?: boolean }) {
  const query: Record<string, string> = {}
  if (params?.activeOnly !== undefined) query.activeOnly = String(params.activeOnly)
  return request.get<CustomerSourceOption[]>('/customer-sources', { params: query })
}

export function createCustomerSourceApi(payload: {
  label: string
  sortOrder?: number
  active?: boolean
}) {
  return request.post<CustomerSourceOption>('/customer-sources', payload)
}

export function updateCustomerSourceApi(
  id: string,
  payload: {
    label?: string
    sortOrder?: number
    active?: boolean
  },
) {
  return request.patch<CustomerSourceOption>(`/customer-sources/${id}`, payload)
}

export function deleteCustomerSourceApi(id: string) {
  return request.delete<{ success: boolean }>(`/customer-sources/${id}`)
}
