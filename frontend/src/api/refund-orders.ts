import request from './request'
import type {
  RefundOrderAttachmentRecord,
  RefundOrderRecord,
} from '@/types/refund-order'

export type RefundOrderListQuery = {
  keyword?: string
  contractId?: string
  customerId?: string
  settlementId?: string
  status?: string
  refundCodes?: string[]
  statuses?: string[]
  contractCodes?: string[]
  customerNames?: string[]
  settlementCodes?: string[]
  itemCounts?: string[]
  attachmentCounts?: string[]
  cashFlowCounts?: string[]
  amounts?: string[]
  paidAmounts?: string[]
  remainingAmounts?: string[]
  createdBys?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
}

export type DisburseRefundPayload = {
  amount?: number
  refundDate?: string
  paymentMethod?: string
  handlerId?: string | null
  remark?: string
}

function toListParams(params?: RefundOrderListQuery) {
  const query: Record<string, string | number> = {}
  if (!params) return undefined
  if (params.keyword) query.keyword = params.keyword
  if (params.contractId) query.contractId = params.contractId
  if (params.customerId) query.customerId = params.customerId
  if (params.settlementId) query.settlementId = params.settlementId
  if (params.refundCodes?.length) query.refundCodes = params.refundCodes.join(',')
  if (params.statuses?.length) query.statuses = params.statuses.join(',')
  else if (params.status) query.statuses = params.status
  if (params.contractCodes?.length) query.contractCodes = params.contractCodes.join(',')
  if (params.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params.settlementCodes?.length) query.settlementCodes = params.settlementCodes.join(',')
  if (params.itemCounts?.length) query.itemCounts = params.itemCounts.join(',')
  if (params.attachmentCounts?.length) {
    query.attachmentCounts = params.attachmentCounts.join(',')
  }
  if (params.cashFlowCounts?.length) query.cashFlowCounts = params.cashFlowCounts.join(',')
  if (params.amounts?.length) query.amounts = params.amounts.join(',')
  if (params.paidAmounts?.length) query.paidAmounts = params.paidAmounts.join(',')
  if (params.remainingAmounts?.length) {
    query.remainingAmounts = params.remainingAmounts.join(',')
  }
  if (params.createdBys?.length) query.createdBys = params.createdBys.join(',')
  if (params.sortBy) query.sortBy = params.sortBy
  if (params.sortDir) query.sortDir = params.sortDir
  if (params.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params.page != null) query.page = params.page
  if (params.pageSize != null) query.pageSize = params.pageSize
  return Object.keys(query).length ? query : undefined
}

export function fetchRefundOrders(params?: RefundOrderListQuery) {
  return request.get<{
    items: RefundOrderRecord[]
    total: number
    page: number
    pageSize: number
  }>('/refund-orders', { params: toListParams(params) })
}

export function fetchRefundOrder(id: string) {
  return request.get<RefundOrderRecord>(`/refund-orders/${id}`)
}

export function deleteRefundOrderApi(id: string, opts?: { silentError?: boolean }) {
  return request.delete<{ success: boolean }>(`/refund-orders/${id}`, opts)
}

/** 打款（全额或部分）：写一条资金流水 */
export function disburseRefundOrderApi(
  id: string,
  payload: DisburseRefundPayload,
  opts?: { silentError?: boolean },
) {
  return request.post<RefundOrderRecord>(`/refund-orders/${id}/disburse`, payload, opts)
}

/** @deprecated 使用 disburseRefundOrderApi */
export function markRefundOrderPaidApi(
  id: string,
  payload: DisburseRefundPayload,
  opts?: { silentError?: boolean },
) {
  return disburseRefundOrderApi(id, payload, opts)
}

export function uploadRefundOrderAttachmentsApi(refundOrderId: string, files: File[]) {
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  return request.post<RefundOrderAttachmentRecord[]>(
    `/refund-orders/${refundOrderId}/attachments`,
    fd,
  )
}

export function deleteRefundOrderAttachmentApi(
  refundOrderId: string,
  attachmentId: string,
) {
  return request.delete<{ success: boolean }>(
    `/refund-orders/${refundOrderId}/attachments/${attachmentId}`,
  )
}

export async function fetchRefundOrderAttachmentBlob(
  refundOrderId: string,
  attachmentId: string,
) {
  const res = await request.get<Blob>(
    `/refund-orders/${refundOrderId}/attachments/${attachmentId}/file`,
    {
      responseType: 'blob',
      silentError: true,
    },
  )
  return res.data
}
