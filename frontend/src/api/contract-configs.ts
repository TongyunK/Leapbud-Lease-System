import request from './request'
import type { ContractConfigOption, ContractConfigType } from '@/types/contract-config'

export function fetchContractConfigs(params?: {
  type?: ContractConfigType
  activeOnly?: boolean
}) {
  const query: Record<string, string> = {}
  if (params?.type) query.type = params.type
  if (params?.activeOnly === false) query.activeOnly = 'false'
  return request.get<ContractConfigOption[]>('/contract-configs', { params: query })
}

export function createContractConfigApi(payload: {
  type: ContractConfigType
  code?: string
  label: string
  unitPrice?: number | null
  sortOrder?: number
  active?: boolean
}) {
  return request.post<ContractConfigOption>('/contract-configs', payload)
}

export function updateContractConfigApi(
  id: string,
  payload: {
    code?: string
    label?: string
    unitPrice?: number | null
    sortOrder?: number
    active?: boolean
  },
) {
  return request.patch<ContractConfigOption>(`/contract-configs/${id}`, payload)
}

export function deleteContractConfigApi(id: string) {
  return request.delete<{ success: boolean }>(`/contract-configs/${id}`)
}

export function batchDeleteContractConfigsApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/contract-configs/batch-delete',
    { ids },
  )
}
