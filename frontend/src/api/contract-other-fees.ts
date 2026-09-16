import request from './request'
import type { ImportBatchResult } from './customers'
import type { ContractOtherFeeRecord } from '@/types/contract-other-fee'
import type { ContractOtherFeeImportPayload } from '@/utils/contractOtherFeeExport'
import type { PaginatedResult } from '@/types/pagination'

export type ContractOtherFeeWritePayload = {
  contractId?: string
  contractCode?: string
  terminationId?: string | null
  terminationCode?: string
  description?: string
  quantity?: number
  unitAmount?: number
  subtotal?: number
  remark?: string
  sortOrder?: number
}

export type ContractOtherFeeListQuery = {
  keyword?: string
  contractId?: string
  customerNames?: string[]
  terminationId?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
}

export function fetchContractOtherFees(params?: ContractOtherFeeListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.contractId) query.contractId = params.contractId
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.terminationId) query.terminationId = params.terminationId
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<PaginatedResult<ContractOtherFeeRecord>>('/contract-other-fees', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchContractOtherFee(id: string) {
  return request.get<ContractOtherFeeRecord>(`/contract-other-fees/${id}`)
}

export function createContractOtherFeeApi(payload: ContractOtherFeeWritePayload) {
  return request.post<ContractOtherFeeRecord>('/contract-other-fees', payload)
}

export function updateContractOtherFeeApi(
  id: string,
  payload: Partial<ContractOtherFeeWritePayload>,
) {
  return request.patch<ContractOtherFeeRecord>(`/contract-other-fees/${id}`, payload)
}

export function deleteContractOtherFeeApi(id: string) {
  return request.delete<{ success: boolean }>(`/contract-other-fees/${id}`)
}

export function batchDeleteContractOtherFeesApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/contract-other-fees/batch-delete',
    { ids },
  )
}

export function importContractOtherFeesApi(items: ContractOtherFeeImportPayload[]) {
  return request.post<ImportBatchResult>('/contract-other-fees/import', { items })
}
