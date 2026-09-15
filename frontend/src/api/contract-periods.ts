import request from './request'
import type { ImportBatchResult } from './customers'
import type { ContractPeriodListRecord } from '@/types/contract-period'

export type ContractPeriodWritePayload = {
  contractId?: string
  contractCode?: string
  /** 无合约编号时按房间解析合约（旧系统导入） */
  roomCode?: string
  /** 可选：与 roomCode 一起缩小合约范围 */
  customerName?: string
  dateType: string
  dateUnit?: string
  dateValue?: number
  startDate: string
  endDate: string
  sortOrder?: number
}

export type ContractPeriodListQuery = {
  keyword?: string
  contractId?: string
  dateTypes?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  startDateFrom?: string
  startDateTo?: string
  endDateFrom?: string
  endDateTo?: string
  createdAtFrom?: string
  createdAtTo?: string
  updatedAtFrom?: string
  updatedAtTo?: string
  page?: number
  pageSize?: number
}

export type ContractPeriodListPage = {
  items: ContractPeriodListRecord[]
  total: number
  page: number
  pageSize: number
}

export function fetchContractPeriods(params?: ContractPeriodListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.contractId) query.contractId = params.contractId
  if (params?.dateTypes?.length) query.dateTypes = params.dateTypes.join(',')
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.startDateFrom) query.startDateFrom = params.startDateFrom
  if (params?.startDateTo) query.startDateTo = params.startDateTo
  if (params?.endDateFrom) query.endDateFrom = params.endDateFrom
  if (params?.endDateTo) query.endDateTo = params.endDateTo
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.updatedAtFrom) query.updatedAtFrom = params.updatedAtFrom
  if (params?.updatedAtTo) query.updatedAtTo = params.updatedAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<ContractPeriodListPage>('/contract-periods', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchContractPeriod(id: string) {
  return request.get<ContractPeriodListRecord>(`/contract-periods/${id}`)
}

export function createContractPeriodApi(payload: ContractPeriodWritePayload) {
  return request.post<ContractPeriodListRecord>('/contract-periods', payload)
}

export function updateContractPeriodApi(
  id: string,
  payload: Partial<ContractPeriodWritePayload>,
) {
  return request.patch<ContractPeriodListRecord>(`/contract-periods/${id}`, payload)
}

export function deleteContractPeriodApi(id: string) {
  return request.delete<{ success: boolean }>(`/contract-periods/${id}`)
}

export function batchDeleteContractPeriodsApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/contract-periods/batch-delete',
    { ids },
  )
}

export function importContractPeriodsApi(items: ContractPeriodWritePayload[]) {
  return request.post<ImportBatchResult>('/contract-periods/import', { items })
}
