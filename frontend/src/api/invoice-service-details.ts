import request from './request'
import type { ImportBatchResult } from './customers'
import type { InvoiceServiceDetailListRecord } from '@/types/invoice-service-detail'
import type { InvoiceServiceDetailImportPayload } from '@/utils/invoiceServiceDetailExport'
import type { PaginatedResult } from '@/types/pagination'

export type InvoiceServiceDetailWritePayload = {
  invoiceId?: string
  invoiceCode?: string
  description?: string
  quantity?: number
  unitAmount?: number
  subtotal?: number
  remark?: string
  sortOrder?: number
}

export type InvoiceServiceDetailListQuery = {
  keyword?: string
  invoiceId?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
}

export function fetchInvoiceServiceDetails(params?: InvoiceServiceDetailListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.invoiceId) query.invoiceId = params.invoiceId
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<PaginatedResult<InvoiceServiceDetailListRecord>>('/invoice-service-details', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchInvoiceServiceDetail(id: string) {
  return request.get<InvoiceServiceDetailListRecord>(`/invoice-service-details/${id}`)
}

export function createInvoiceServiceDetailApi(payload: InvoiceServiceDetailWritePayload) {
  return request.post<InvoiceServiceDetailListRecord>('/invoice-service-details', payload)
}

export function updateInvoiceServiceDetailApi(
  id: string,
  payload: Partial<InvoiceServiceDetailWritePayload>,
) {
  return request.patch<InvoiceServiceDetailListRecord>(`/invoice-service-details/${id}`, payload)
}

export function deleteInvoiceServiceDetailApi(id: string) {
  return request.delete<{ success: boolean }>(`/invoice-service-details/${id}`)
}

export function batchDeleteInvoiceServiceDetailsApi(ids: string[]) {
  return request.post<{
    deleted: number
    failed: number
    failures: Array<{ id: string; message: string }>
  }>('/invoice-service-details/batch-delete', { ids })
}

export function importInvoiceServiceDetailsApi(items: InvoiceServiceDetailImportPayload[]) {
  return request.post<ImportBatchResult>('/invoice-service-details/import', { items })
}
