import request from './request'
import type { CashFlowRecord } from '@/types/cash-flow'

export type CashFlowListQuery = {
  keyword?: string
  contractId?: string
  customerId?: string
  receiptId?: string
  refundOrderId?: string
  invoiceId?: string
  receivableId?: string
  direction?: string
  sourceType?: string
  flowCodes?: string[]
  directions?: string[]
  sourceTypes?: string[]
  sourceRefs?: string[]
  contractCodes?: string[]
  customerNames?: string[]
  amounts?: string[]
  receiptCounts?: string[]
  refundOrderCounts?: string[]
  createdBys?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  flowDateFrom?: string
  flowDateTo?: string
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
}

function toListParams(params?: CashFlowListQuery) {
  const query: Record<string, string | number> = {}
  if (!params) return undefined
  if (params.keyword) query.keyword = params.keyword
  if (params.contractId) query.contractId = params.contractId
  if (params.customerId) query.customerId = params.customerId
  if (params.receiptId) query.receiptId = params.receiptId
  if (params.refundOrderId) query.refundOrderId = params.refundOrderId
  if (params.invoiceId) query.invoiceId = params.invoiceId
  if (params.receivableId) query.receivableId = params.receivableId
  if (params.flowCodes?.length) query.flowCodes = params.flowCodes.join(',')
  if (params.directions?.length) query.directions = params.directions.join(',')
  else if (params.direction) query.directions = params.direction
  if (params.sourceTypes?.length) query.sourceTypes = params.sourceTypes.join(',')
  else if (params.sourceType) query.sourceTypes = params.sourceType
  if (params.sourceRefs?.length) query.sourceRefs = params.sourceRefs.join(',')
  if (params.contractCodes?.length) query.contractCodes = params.contractCodes.join(',')
  if (params.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params.amounts?.length) query.amounts = params.amounts.join(',')
  if (params.receiptCounts?.length) query.receiptCounts = params.receiptCounts.join(',')
  if (params.refundOrderCounts?.length) {
    query.refundOrderCounts = params.refundOrderCounts.join(',')
  }
  if (params.createdBys?.length) query.createdBys = params.createdBys.join(',')
  if (params.sortBy) query.sortBy = params.sortBy
  if (params.sortDir) query.sortDir = params.sortDir
  if (params.flowDateFrom) query.flowDateFrom = params.flowDateFrom
  if (params.flowDateTo) query.flowDateTo = params.flowDateTo
  if (params.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params.page != null) query.page = params.page
  if (params.pageSize != null) query.pageSize = params.pageSize
  return Object.keys(query).length ? query : undefined
}

export type CashFlowDirectionCounts = {
  all: number
  in: number
  out: number
}

export function fetchCashFlowDirectionCounts() {
  return request.get<CashFlowDirectionCounts>('/cash-flows/stats/direction')
}

export function fetchCashFlows(params?: CashFlowListQuery) {
  return request.get<{
    items: CashFlowRecord[]
    total: number
    page: number
    pageSize: number
  }>('/cash-flows', { params: toListParams(params) })
}

export function fetchCashFlow(id: string) {
  return request.get<CashFlowRecord>(`/cash-flows/${id}`)
}

export function deleteCashFlowApi(id: string, opts?: { silentError?: boolean }) {
  return request.delete<{ success: boolean }>(`/cash-flows/${id}`, opts)
}
