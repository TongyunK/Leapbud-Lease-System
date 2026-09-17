import request from './request'
import type { ImportBatchResult } from './customers'
import type { InvoiceRecord, InvoiceServiceDetailRecord } from '@/types/invoice'
import type { InvoiceImportPayload } from '@/utils/invoiceExport'
import type { PaginatedResult } from '@/types/pagination'

export type InvoiceWritePayload = {
  contractId?: string
  contractCode?: string
  invoiceCode?: string
  invoiceType?: string
  description?: string
  amount?: number
  status?: string
  invoiceDate?: string
  paymentDueDate?: string
  salesManagerId?: string | null
  relatedReceivableRef?: string
  attachment?: string
  roomNameText?: string
  notes?: string
  whatsappNumber?: string
  shortTermRentalCode?: string
  remark?: string
  serviceDetails?: InvoiceServiceDetailRecord[]
}

export type InvoiceListQuery = {
  keyword?: string
  contractId?: string
  contractIds?: string[]
  customerId?: string
  roomId?: string
  customerNames?: string[]
  status?: string
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

export function fetchInvoices(params?: InvoiceListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.contractId) query.contractId = params.contractId
  if (params?.contractIds?.length) query.contractIds = params.contractIds.join(',')
  if (params?.customerId) query.customerId = params.customerId
  if (params?.roomId) query.roomId = params.roomId
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.status) query.status = params.status
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
  return request.get<PaginatedResult<InvoiceRecord>>('/invoices', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchInvoice(id: string) {
  return request.get<InvoiceRecord>(`/invoices/${id}`)
}

export function createInvoiceApi(payload: InvoiceWritePayload) {
  return request.post<InvoiceRecord>('/invoices', payload)
}

export function updateInvoiceApi(id: string, payload: Partial<InvoiceWritePayload>) {
  return request.patch<InvoiceRecord>(`/invoices/${id}`, payload)
}

export function deleteInvoiceApi(id: string) {
  return request.delete<{ success: boolean }>(`/invoices/${id}`)
}

export function batchDeleteInvoicesApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/invoices/batch-delete',
    { ids },
  )
}

export function importInvoicesApi(items: InvoiceImportPayload[]) {
  return request.post<ImportBatchResult>('/invoices/import', { items })
}
