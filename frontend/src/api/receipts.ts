import request from './request'
import type { ImportBatchResult } from './customers'
import type { ReceiptRecord } from '@/types/receipt'
import type { ReceiptImportPayload } from '@/utils/receiptExport'
import type { PaginatedResult } from '@/types/pagination'

export type ReceiptWritePayload = {
  receiptCode?: string
  customerId?: string
  customerCode?: string
  customerName?: string
  contractId?: string | null
  contractCode?: string
  invoiceId?: string | null
  invoiceCode?: string
  receivableId?: string | null
  receivableCode?: string
  paymentDate?: string
  paymentMethod?: string
  amount?: number
  remark?: string
  voucher1?: string
  voucher2?: string
  changeLog?: string
}

export type ReceiptListQuery = {
  keyword?: string
  customerId?: string
  customerNames?: string[]
  paymentMethod?: string[]
  contractCodes?: string[]
  invoiceCodes?: string[]
  receivableCodes?: string[]
  contractId?: string
  invoiceId?: string
  receivableId?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  paymentDateFrom?: string
  paymentDateTo?: string
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
}

export function fetchReceipts(params?: ReceiptListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.customerId) query.customerId = params.customerId
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.paymentMethod?.length) query.paymentMethod = params.paymentMethod.join(',')
  if (params?.contractCodes?.length) query.contractCodes = params.contractCodes.join(',')
  if (params?.invoiceCodes?.length) query.invoiceCodes = params.invoiceCodes.join(',')
  if (params?.receivableCodes?.length) query.receivableCodes = params.receivableCodes.join(',')
  if (params?.contractId) query.contractId = params.contractId
  if (params?.invoiceId) query.invoiceId = params.invoiceId
  if (params?.receivableId) query.receivableId = params.receivableId
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.paymentDateFrom) query.paymentDateFrom = params.paymentDateFrom
  if (params?.paymentDateTo) query.paymentDateTo = params.paymentDateTo
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<PaginatedResult<ReceiptRecord>>('/receipts', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchReceipt(id: string) {
  return request.get<ReceiptRecord>(`/receipts/${id}`)
}

export function createReceiptApi(payload: ReceiptWritePayload) {
  return request.post<ReceiptRecord>('/receipts', payload)
}

export function updateReceiptApi(id: string, payload: Partial<ReceiptWritePayload>) {
  return request.patch<ReceiptRecord>(`/receipts/${id}`, payload)
}

export function deleteReceiptApi(id: string) {
  return request.delete<{ success: boolean }>(`/receipts/${id}`)
}

export function batchDeleteReceiptsApi(ids: string[]) {
  return request.post<{
    deleted: number
    failed: number
    failures: Array<{ id: string; message: string }>
  }>('/receipts/batch-delete', { ids })
}

export function importReceiptsApi(items: ReceiptImportPayload[]) {
  return request.post<ImportBatchResult>('/receipts/import', { items })
}
