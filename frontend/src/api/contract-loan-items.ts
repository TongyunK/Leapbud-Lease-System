import request from './request'
import type { ImportBatchResult } from './customers'
import type { ContractLoanItemRecord } from '@/types/contract-loan-item'
import type { ContractLoanItemImportPayload } from '@/utils/contractLoanItemExport'
import type { PaginatedResult } from '@/types/pagination'

export type ContractLoanItemWritePayload = {
  contractId?: string
  contractCode?: string
  roomCode?: string
  customerName?: string
  description?: string
  quantity?: number
  unitAmount?: number
  subtotal?: number
  remark?: string
  sortOrder?: number
}

export type ContractLoanItemListQuery = {
  keyword?: string
  contractId?: string
  contractCodes?: string[]
  customerNames?: string[]
  quantities?: string[]
  unitAmounts?: string[]
  subtotals?: string[]
  roomCodes?: string[]
  createdBys?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
}

export function fetchContractLoanItems(params?: ContractLoanItemListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.contractId) query.contractId = params.contractId
  if (params?.contractCodes?.length) query.contractCodes = params.contractCodes.join(',')
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.quantities?.length) query.quantities = params.quantities.join(',')
  if (params?.unitAmounts?.length) query.unitAmounts = params.unitAmounts.join(',')
  if (params?.subtotals?.length) query.subtotals = params.subtotals.join(',')
  if (params?.roomCodes?.length) query.roomCodes = params.roomCodes.join(',')
  if (params?.createdBys?.length) query.createdBys = params.createdBys.join(',')
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<PaginatedResult<ContractLoanItemRecord>>('/contract-loan-items', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchContractLoanItem(id: string) {
  return request.get<ContractLoanItemRecord>(`/contract-loan-items/${id}`)
}

export function createContractLoanItemApi(payload: ContractLoanItemWritePayload) {
  return request.post<ContractLoanItemRecord>('/contract-loan-items', payload)
}

export function updateContractLoanItemApi(
  id: string,
  payload: Partial<ContractLoanItemWritePayload>,
) {
  return request.patch<ContractLoanItemRecord>(`/contract-loan-items/${id}`, payload)
}

export function deleteContractLoanItemApi(id: string) {
  return request.delete<{ success: boolean }>(`/contract-loan-items/${id}`)
}

export function batchDeleteContractLoanItemsApi(ids: string[]) {
  return request.post<{
    deleted: number
    failed: number
    failures: Array<{ id: string; message: string }>
  }>('/contract-loan-items/batch-delete', { ids })
}

export function importContractLoanItemsApi(items: ContractLoanItemImportPayload[]) {
  return request.post<ImportBatchResult>('/contract-loan-items/import', { items })
}
