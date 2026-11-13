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
  refundedAmount?: number
  receivableAmount?: number
  remark?: string
  relatedReceiptRef?: string
  /** 关联收据 ID 列表（一对多同步） */
  receiptIds?: string[]
  depositRefundId?: string | null
  depositRefundCode?: string
}

export type ReceivableListQuery = {
  keyword?: string
  invoiceId?: string
  invoiceCodes?: string[]
  contractId?: string
  contractIds?: string[]
  contractCodes?: string[]
  customerId?: string
  depositRefundId?: string
  customerNames?: string[]
  invoiceAmounts?: string[]
  receivedAmounts?: string[]
  refundedAmounts?: string[]
  receivableAmounts?: string[]
  createdBys?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  invoiceDateFrom?: string
  invoiceDateTo?: string
  paymentDueDateFrom?: string
  paymentDueDateTo?: string
  createdAtFrom?: string
  createdAtTo?: string
  /** 待收款：应收额>0 */
  outstanding?: boolean
  /** 已逾期：收款期限早于今日且应收额>0；可与 outstanding 叠加 */
  overdue?: boolean
  /** 有效性：active=有效（默认）；invalid=失效；all=全部（关联抽屉） */
  validity?: 'active' | 'invalid' | 'all'
  page?: number
  pageSize?: number
}

export type ReceivableQuickCounts = {
  all: number
  outstanding: number
  overdue: number
  active: number
  invalid: number
}

export function fetchReceivableQuickCounts(params?: {
  validity?: 'active' | 'invalid' | 'all'
}) {
  const query: Record<string, string> = {}
  if (params?.validity) query.validity = params.validity
  return request.get<ReceivableQuickCounts>('/receivables/stats/quick', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchReceivables(params?: ReceivableListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.invoiceId) query.invoiceId = params.invoiceId
  if (params?.invoiceCodes?.length) query.invoiceCodes = params.invoiceCodes.join(',')
  if (params?.contractId) query.contractId = params.contractId
  if (params?.contractIds?.length) query.contractIds = params.contractIds.join(',')
  if (params?.contractCodes?.length) query.contractCodes = params.contractCodes.join(',')
  if (params?.customerId) query.customerId = params.customerId
  if (params?.depositRefundId) query.depositRefundId = params.depositRefundId
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.invoiceAmounts?.length) query.invoiceAmounts = params.invoiceAmounts.join(',')
  if (params?.receivedAmounts?.length) query.receivedAmounts = params.receivedAmounts.join(',')
  if (params?.refundedAmounts?.length) query.refundedAmounts = params.refundedAmounts.join(',')
  if (params?.receivableAmounts?.length) {
    query.receivableAmounts = params.receivableAmounts.join(',')
  }
  if (params?.createdBys?.length) query.createdBys = params.createdBys.join(',')
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.invoiceDateFrom) query.invoiceDateFrom = params.invoiceDateFrom
  if (params?.invoiceDateTo) query.invoiceDateTo = params.invoiceDateTo
  if (params?.paymentDueDateFrom) query.paymentDueDateFrom = params.paymentDueDateFrom
  if (params?.paymentDueDateTo) query.paymentDueDateTo = params.paymentDueDateTo
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.outstanding) query.outstanding = 'true'
  if (params?.overdue) query.overdue = 'true'
  if (params?.validity) query.validity = params.validity
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
