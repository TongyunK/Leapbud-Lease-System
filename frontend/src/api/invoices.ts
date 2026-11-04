import request from './request'
import type { ImportBatchResult } from './customers'
import type { InvoiceRecord, InvoiceServiceDetailRecord } from '@/types/invoice'
import type { InvoiceImportPayload } from '@/utils/invoiceExport'
import type { PaginatedResult } from '@/types/pagination'

export type InvoiceWritePayload = {
  source?: 'contract' | 'short_term' | string
  contractId?: string
  contractCode?: string
  invoiceCode?: string
  customerId?: string
  roomId?: string
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
  rentalStartDate?: string
  rentalEndDate?: string
  rentalDurationText?: string
  referredByCustomerId?: string | null
  remark?: string
  serviceDetails?: InvoiceServiceDetailRecord[]
}

export type InvoiceListQuery = {
  keyword?: string
  contractId?: string
  contractIds?: string[]
  customerId?: string
  roomId?: string
  invoiceCodes?: string[]
  contractCodes?: string[]
  customerNames?: string[]
  buildingNames?: string[]
  roomNames?: string[]
  invoiceTypes?: string[]
  amounts?: string[]
  status?: string
  salesManagers?: string[]
  sources?: string[]
  source?: string
  /** manual | auto */
  billingKind?: string
  createdBys?: string[]
  /** 仅按金票（invoiceType=Deposit）；可与 source=contract 叠加 */
  depositOnly?: boolean
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  invoiceDateFrom?: string
  invoiceDateTo?: string
  invoiceDateEmpty?: boolean
  paymentDueDateFrom?: string
  paymentDueDateTo?: string
  paymentDueDateEmpty?: boolean
  createdAtFrom?: string
  createdAtTo?: string
  createdAtEmpty?: boolean
  page?: number
  pageSize?: number
}

export type InvoiceSourceCounts = {
  all: number
  contract: number
  short_term: number
  deposit: number
}

export function fetchInvoiceSourceCounts() {
  return request.get<InvoiceSourceCounts>('/invoices/stats/source')
}

export function fetchInvoices(params?: InvoiceListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.contractId) query.contractId = params.contractId
  if (params?.contractIds?.length) query.contractIds = params.contractIds.join(',')
  if (params?.customerId) query.customerId = params.customerId
  if (params?.roomId) query.roomId = params.roomId
  if (params?.invoiceCodes?.length) query.invoiceCodes = params.invoiceCodes.join(',')
  if (params?.contractCodes?.length) query.contractCodes = params.contractCodes.join(',')
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.buildingNames?.length) query.buildingNames = params.buildingNames.join(',')
  if (params?.roomNames?.length) query.roomNames = params.roomNames.join(',')
  if (params?.invoiceTypes?.length) query.invoiceTypes = params.invoiceTypes.join(',')
  if (params?.amounts?.length) query.amounts = params.amounts.join(',')
  if (params?.status) query.status = params.status
  if (params?.salesManagers?.length) query.salesManagers = params.salesManagers.join(',')
  if (params?.sources?.length) query.sources = params.sources.join(',')
  if (params?.source) query.source = params.source
  if (params?.billingKind) query.billingKind = params.billingKind
  if (params?.createdBys?.length) query.createdBys = params.createdBys.join(',')
  if (params?.depositOnly) query.depositOnly = 'true'
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.invoiceDateFrom) query.invoiceDateFrom = params.invoiceDateFrom
  if (params?.invoiceDateTo) query.invoiceDateTo = params.invoiceDateTo
  if (params?.invoiceDateEmpty) query.invoiceDateEmpty = 'true'
  if (params?.paymentDueDateFrom) query.paymentDueDateFrom = params.paymentDueDateFrom
  if (params?.paymentDueDateTo) query.paymentDueDateTo = params.paymentDueDateTo
  if (params?.paymentDueDateEmpty) query.paymentDueDateEmpty = 'true'
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.createdAtEmpty) query.createdAtEmpty = 'true'
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<PaginatedResult<InvoiceRecord>>('/invoices', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchInvoice(id: string) {
  return request.get<InvoiceRecord>(`/invoices/${id}`)
}

/** 预览下一个发票编号（不占用序号；合约传 contractId、短租传 roomId 以带房间后缀） */
export function previewInvoiceCodeApi(opts?: { contractId?: string; roomId?: string }) {
  const contractId = opts?.contractId?.trim() || ''
  const roomId = opts?.roomId?.trim() || ''
  const params: Record<string, string> = {}
  if (contractId) params.contractId = contractId
  else if (roomId) params.roomId = roomId
  return request.get<{ code: string }>('/invoices/code-preview', {
    params: Object.keys(params).length ? params : undefined,
  })
}

export function createInvoiceApi(
  payload: InvoiceWritePayload,
  opts?: { silentError?: boolean },
) {
  return request.post<InvoiceRecord>('/invoices', payload, {
    silentError: opts?.silentError,
  })
}

export function updateInvoiceApi(
  id: string,
  payload: Partial<InvoiceWritePayload>,
  opts?: { silentError?: boolean },
) {
  return request.patch<InvoiceRecord>(`/invoices/${id}`, payload, {
    silentError: opts?.silentError,
  })
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
