import request from './request'
import type { ImportBatchResult } from './customers'
import type { ReceivableRecord } from '@/types/receivable'
import type { ReceivableImportPayload } from '@/utils/receivableExport'
import type { PaginatedResult } from '@/types/pagination'

export type ReceivableWritePayload = {
  invoiceId?: string
  invoiceCode?: string
  receivableCode?: string
  contractId?: string
  contractCode?: string
  customerId?: string
  invoiceDate?: string
  paymentDueDate?: string
  invoiceAmount?: number
  receivedAmount?: number
  receivableAmount?: number
  remark?: string
  relatedReceiptRef?: string
  depositRefundId?: string | null
  depositRefundCode?: string
}

export type ReceivableListQuery = {
  keyword?: string
  invoiceId?: string
  contractId?: string
  customerNames?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  invoiceDateFrom?: string
  invoiceDateTo?: string
  paymentDueDateFrom?: string
  paymentDueDateTo?: string
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
}

export function fetchReceivables(params?: ReceivableListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.invoiceId) query.invoiceId = params.invoiceId
  if (params?.contractId) query.contractId = params.contractId
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.invoiceDateFrom) query.invoiceDateFrom = params.invoiceDateFrom
  if (params?.invoiceDateTo) query.invoiceDateTo = params.invoiceDateTo
  if (params?.paymentDueDateFrom) query.paymentDueDateFrom = params.paymentDueDateFrom
  if (params?.paymentDueDateTo) query.paymentDueDateTo = params.paymentDueDateTo
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<PaginatedResult<ReceivableRecord>>('/receivables', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchReceivable(id: string) {
  return request.get<ReceivableRecord>(`/receivables/${id}`)
}

export function createReceivableApi(payload: ReceivableWritePayload) {
  return request.post<ReceivableRecord>('/receivables', payload)
}

export function updateReceivableApi(id: string, payload: Partial<ReceivableWritePayload>) {
  return request.patch<ReceivableRecord>(`/receivables/${id}`, payload)
}

export function deleteReceivableApi(id: string) {
  return request.delete<{ success: boolean }>(`/receivables/${id}`)
}

export function batchDeleteReceivablesApi(ids: string[]) {
  return request.post<{
    deleted: number
    failed: number
    failures: Array<{ id: string; message: string }>
  }>('/receivables/batch-delete', { ids })
}

export function importReceivablesApi(items: ReceivableImportPayload[]) {
  return request.post<ImportBatchResult>('/receivables/import', { items })
}
