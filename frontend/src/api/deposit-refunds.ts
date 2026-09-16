import request from './request'
import type { ImportBatchResult } from './customers'
import type { DepositRefundRecord } from '@/types/deposit-refund'
import type { DepositRefundImportPayload } from '@/utils/depositRefundExport'
import type { PaginatedResult } from '@/types/pagination'

export type DepositRefundWritePayload = {
  contractId?: string
  contractCode?: string
  refundCode?: string
  status?: string
  terminationDate?: string
  refundDate?: string
  totalDeposit?: number
  actualRefundAmount?: number
  handlerId?: string | null
  voucherImage?: string
  voucherAttachment?: string
  remark?: string
}

export type DepositRefundListQuery = {
  keyword?: string
  contractId?: string
  customerNames?: string[]
  status?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  terminationDateFrom?: string
  terminationDateTo?: string
  refundDateFrom?: string
  refundDateTo?: string
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
}

export function fetchDepositRefunds(params?: DepositRefundListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.contractId) query.contractId = params.contractId
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.status) query.status = params.status
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.terminationDateFrom) query.terminationDateFrom = params.terminationDateFrom
  if (params?.terminationDateTo) query.terminationDateTo = params.terminationDateTo
  if (params?.refundDateFrom) query.refundDateFrom = params.refundDateFrom
  if (params?.refundDateTo) query.refundDateTo = params.refundDateTo
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<PaginatedResult<DepositRefundRecord>>('/deposit-refunds', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchDepositRefund(id: string) {
  return request.get<DepositRefundRecord>(`/deposit-refunds/${id}`)
}

export function createDepositRefundApi(payload: DepositRefundWritePayload) {
  return request.post<DepositRefundRecord>('/deposit-refunds', payload)
}

export function updateDepositRefundApi(
  id: string,
  payload: Partial<DepositRefundWritePayload>,
) {
  return request.patch<DepositRefundRecord>(`/deposit-refunds/${id}`, payload)
}

export function deleteDepositRefundApi(id: string) {
  return request.delete<{ success: boolean }>(`/deposit-refunds/${id}`)
}

export function batchDeleteDepositRefundsApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/deposit-refunds/batch-delete',
    { ids },
  )
}

export function importDepositRefundsApi(items: DepositRefundImportPayload[]) {
  return request.post<ImportBatchResult>('/deposit-refunds/import', { items })
}
