import request from './request'
import type { ImportBatchResult } from './customers'
import type { ReceiptAttachmentRecord, ReceiptRecord } from '@/types/receipt'
import type { ReceiptImportPayload } from '@/utils/receiptExport'
import type { PaginatedResult } from '@/types/pagination'

export type ReceiptWritePayload = {
  receiptCode?: string
  kind?: string
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
  changeLog?: string
}

export type ReceiptListQuery = {
  keyword?: string
  customerId?: string
  customerNames?: string[]
  paymentMethod?: string[]
  kinds?: string[]
  contractCodes?: string[]
  invoiceCodes?: string[]
  receivableCodes?: string[]
  contractId?: string
  contractIds?: string[]
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

export type ReceiptKindCounts = {
  all: number
  invoice: number
  booking_deposit: number
}

export function fetchReceiptKindCounts() {
  return request.get<ReceiptKindCounts>('/receipts/stats/kind')
}

export function fetchReceipts(params?: ReceiptListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.customerId) query.customerId = params.customerId
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.paymentMethod?.length) query.paymentMethod = params.paymentMethod.join(',')
  if (params?.kinds?.length) query.kinds = params.kinds.join(',')
  if (params?.contractCodes?.length) query.contractCodes = params.contractCodes.join(',')
  if (params?.invoiceCodes?.length) query.invoiceCodes = params.invoiceCodes.join(',')
  if (params?.receivableCodes?.length) query.receivableCodes = params.receivableCodes.join(',')
  if (params?.contractId) query.contractId = params.contractId
  if (params?.contractIds?.length) query.contractIds = params.contractIds.join(',')
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

export function uploadReceiptAttachmentsApi(receiptId: string, files: File[]) {
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  return request.post<ReceiptAttachmentRecord[]>(`/receipts/${receiptId}/attachments`, fd)
}

export function deleteReceiptAttachmentApi(receiptId: string, attachmentId: string) {
  return request.delete<{ success: boolean }>(
    `/receipts/${receiptId}/attachments/${attachmentId}`,
  )
}

/** 拉取收据附件二进制（需 JWT），用于 Auth 预览 */
export async function fetchReceiptAttachmentBlob(receiptId: string, attachmentId: string) {
  const res = await request.get<Blob>(
    `/receipts/${receiptId}/attachments/${attachmentId}/file`,
    {
      responseType: 'blob',
      silentError: true,
    },
  )
  return res.data
}
