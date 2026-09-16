import request from './request'
import type { ImportBatchResult } from './customers'
import type { ContractOtherFeeNestedRecord } from '@/types/contract-other-fee'
import type { LeaseTerminationRecord } from '@/types/lease-termination'
import type { LeaseTerminationImportPayload } from '@/utils/leaseTerminationExport'
import type { PaginatedResult } from '@/types/pagination'

export type LeaseTerminationWritePayload = {
  contractId?: string
  contractCode?: string
  customerId?: string
  roomId?: string
  terminationCode?: string
  reason?: string
  terminationDate?: string
  noticeAttachment?: string
  doorKeyReturnedQty?: number
  smartCardReturnedQty?: number
  siteCondition?: string
  remark?: string
  relatedDepositRefund?: string
  otherFees?: ContractOtherFeeNestedRecord[]
}

export type LeaseTerminationListQuery = {
  keyword?: string
  contractId?: string
  customerNames?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  terminationDateFrom?: string
  terminationDateTo?: string
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
}

export function fetchLeaseTerminations(params?: LeaseTerminationListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.contractId) query.contractId = params.contractId
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.terminationDateFrom) query.terminationDateFrom = params.terminationDateFrom
  if (params?.terminationDateTo) query.terminationDateTo = params.terminationDateTo
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<PaginatedResult<LeaseTerminationRecord>>('/lease-terminations', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchLeaseTermination(id: string) {
  return request.get<LeaseTerminationRecord>(`/lease-terminations/${id}`)
}

export function createLeaseTerminationApi(payload: LeaseTerminationWritePayload) {
  return request.post<LeaseTerminationRecord>('/lease-terminations', payload)
}

export function updateLeaseTerminationApi(
  id: string,
  payload: Partial<LeaseTerminationWritePayload>,
) {
  return request.patch<LeaseTerminationRecord>(`/lease-terminations/${id}`, payload)
}

export function deleteLeaseTerminationApi(id: string) {
  return request.delete<{ success: boolean }>(`/lease-terminations/${id}`)
}

export function batchDeleteLeaseTerminationsApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/lease-terminations/batch-delete',
    { ids },
  )
}

export function importLeaseTerminationsApi(items: LeaseTerminationImportPayload[]) {
  return request.post<ImportBatchResult>('/lease-terminations/import', { items })
}
