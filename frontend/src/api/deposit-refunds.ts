import request from './request'
import type { ImportBatchResult } from './customers'
import type {
  DepositRefundAttachmentRecord,
  DepositRefundRecord,
} from '@/types/deposit-refund'
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
  bookingDepositRefundAmount?: number
  handlerId?: string | null
  remark?: string
}

export type DepositRefundListQuery = {
  keyword?: string
  contractId?: string
  customerId?: string
  roomId?: string
  refundCodes?: string[]
  contractCodes?: string[]
  customerNames?: string[]
  roomNames?: string[]
  totalDeposits?: string[]
  actualRefundAmounts?: string[]
  handlers?: string[]
  createdBys?: string[]
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
  if (params?.customerId) query.customerId = params.customerId
  if (params?.roomId) query.roomId = params.roomId
  if (params?.refundCodes?.length) query.refundCodes = params.refundCodes.join(',')
  if (params?.contractCodes?.length) query.contractCodes = params.contractCodes.join(',')
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.roomNames?.length) query.roomNames = params.roomNames.join(',')
  if (params?.totalDeposits?.length) query.totalDeposits = params.totalDeposits.join(',')
  if (params?.actualRefundAmounts?.length) {
    query.actualRefundAmounts = params.actualRefundAmounts.join(',')
  }
  if (params?.handlers?.length) query.handlers = params.handlers.join(',')
  if (params?.createdBys?.length) query.createdBys = params.createdBys.join(',')
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

export function createDepositRefundApi(
  payload: DepositRefundWritePayload,
  opts?: { silentError?: boolean },
) {
  return request.post<DepositRefundRecord>('/deposit-refunds', payload, opts)
}

export function updateDepositRefundApi(
  id: string,
  payload: Partial<DepositRefundWritePayload>,
  opts?: { silentError?: boolean },
) {
  return request.patch<DepositRefundRecord>(`/deposit-refunds/${id}`, payload, opts)
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

export function uploadDepositRefundAttachmentsApi(depositRefundId: string, files: File[]) {
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  return request.post<DepositRefundAttachmentRecord[]>(
    `/deposit-refunds/${depositRefundId}/attachments`,
    fd,
  )
}

export function deleteDepositRefundAttachmentApi(
  depositRefundId: string,
  attachmentId: string,
) {
  return request.delete<{ success: boolean }>(
    `/deposit-refunds/${depositRefundId}/attachments/${attachmentId}`,
  )
}

/** 拉取按金退还凭证二进制（需 JWT），用于 Auth 预览 */
export async function fetchDepositRefundAttachmentBlob(
  depositRefundId: string,
  attachmentId: string,
) {
  const res = await request.get<Blob>(
    `/deposit-refunds/${depositRefundId}/attachments/${attachmentId}/file`,
    {
      responseType: 'blob',
      silentError: true,
    },
  )
  return res.data
}
