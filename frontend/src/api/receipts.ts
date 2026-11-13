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
  receiptCodes?: string[]
  contractCodes?: string[]
  invoiceCodes?: string[]
  receivableCodes?: string[]
  amounts?: string[]
  remarks?: string[]
  changeLogs?: string[]
  createdBys?: string[]
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
  cashFlowCounts?: string[]
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
  if (params?.receiptCodes?.length) query.receiptCodes = params.receiptCodes.join(',')
  if (params?.contractCodes?.length) query.contractCodes = params.contractCodes.join(',')
  if (params?.invoiceCodes?.length) query.invoiceCodes = params.invoiceCodes.join(',')
  if (params?.receivableCodes?.length) query.receivableCodes = params.receivableCodes.join(',')
  if (params?.amounts?.length) query.amounts = params.amounts.join(',')
  if (params?.remarks?.length) query.remarks = params.remarks.join(',')
  if (params?.changeLogs?.length) query.changeLogs = params.changeLogs.join(',')
  if (params?.createdBys?.length) query.createdBys = params.createdBys.join(',')
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
  if (params?.cashFlowCounts?.length) query.cashFlowCounts = params.cashFlowCounts.join(',')
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<PaginatedResult<ReceiptRecord>>('/receipts', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchReceipt(id: string) {
  return request.get<ReceiptRecord>(`/receipts/${id}`)
}

export function createReceiptApi(
  payload: ReceiptWritePayload,
  opts?: { silentError?: boolean },
) {
  return request.post<ReceiptRecord>('/receipts', payload, opts)
}

export function updateReceiptApi(
  id: string,
  payload: Partial<ReceiptWritePayload>,
  opts?: { silentError?: boolean },
) {
  return request.patch<ReceiptRecord>(`/receipts/${id}`, payload, opts)
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

/** 定金动账 */
export type BookingDepositMovement = {
  id: string
  type: 'apply' | 'refund' | 'top_up' | 'forfeit'
  amount: number
  movementDate: string
  receivableId: string | null
  invoiceId: string | null
  invoiceCode?: string
  offsetReceiptId: string | null
  offsetReceiptCode: string
  depositRefundId: string | null
  remark: string
  createdBy: string
  createdAt: string
  bookingDepositReceiptId?: string
  bookingDepositReceiptCode?: string
}

/** 合约定金账户下的单张定金收据摘要 */
export type BookingDepositReceiptSummary = {
  id: string
  receiptCode: string
  amount: number
  paymentMethod?: string
}

/** 定金账户：合约汇总或单张收据视角 */
export type BookingDepositAccount = {
  contractId: string
  receiptId: string | null
  receiptCode: string
  receipts?: BookingDepositReceiptSummary[]
  scope?: 'contract' | 'receipt'
  principal: number
  applied: number
  refunded: number
  /** 没收／扣留合计 */
  forfeited?: number
  balance: number
  /** 合约池可用余额（单张收据视角下退还上限） */
  contractBalance?: number
  movements: BookingDepositMovement[]
}

export function fetchBookingDepositByContractApi(contractId: string) {
  return request.get<BookingDepositAccount>(
    `/receipts/booking-deposit/by-contract/${contractId}`,
  )
}

export function fetchBookingDepositByReceiptApi(receiptId: string) {
  return request.get<BookingDepositAccount>(`/receipts/${receiptId}/booking-deposit-account`)
}

/** 按合约 / 应收 / 发票列出定金抵扣动账 */
export type BookingDepositApplyRow = {
  id: string
  type: 'apply' | 'refund'
  amount: number
  movementDate: string
  receivableId: string | null
  invoiceId: string | null
  invoiceCode?: string
  bookingDepositReceiptId?: string
  bookingDepositReceiptCode?: string
  remark: string
}

export function fetchBookingDepositAppliesApi(params: {
  contractId?: string
  receivableId?: string
  invoiceId?: string
}) {
  return request.get<BookingDepositApplyRow[]>('/receipts/booking-deposit/applies', { params })
}

export function collectWithBookingDepositApi(
  payload: {
    contractId: string
    receivableIds: string[]
    bookingDepositApply: number
    /** 本次现金收款金额（0=仅定金抵扣） */
    cashAmount: number
    paymentDate: string
    paymentMethod?: string
    remark?: string
  },
  opts?: { silentError?: boolean },
) {
  return request.post<{
    ok: boolean
    receiptIds: string[]
    movementIds: string[]
    account: BookingDepositAccount
  }>('/receipts/collect-with-booking-deposit', payload, opts)
}

export function refundBookingDepositApi(
  payload: {
    contractId: string
    amount: number
    refundDate: string
    remark?: string
    depositRefundId?: string
  },
  opts?: { silentError?: boolean },
) {
  return request.post<{
    movement: BookingDepositMovement
    account: BookingDepositAccount
  }>('/receipts/booking-deposit/refund', payload, opts)
}

/** 签约中加收定金（默认新开收据；merge=合并到指定已有定金收据） */
export function topUpBookingDepositApi(
  payload: {
    contractId: string
    amount: number
    paymentDate: string
    mode?: 'new_receipt' | 'merge'
    /** mode=merge 时指定目标定金收据；省略则首张 */
    mergeReceiptId?: string
    paymentMethod?: string
    remark?: string
    paymentVoucher?: string
  },
  opts?: { silentError?: boolean },
) {
  return request.post<{
    movement: BookingDepositMovement
    account: BookingDepositAccount
  }>('/receipts/booking-deposit/top-up', payload, opts)
}
