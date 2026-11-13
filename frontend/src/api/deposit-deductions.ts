import request from './request'
import type { DepositDeductionRecord } from '@/types/deposit-deduction'
import type { PaginatedResult } from '@/types/pagination'

export type DepositDeductionListQuery = {
  keyword?: string
  contractId?: string
  contractCodes?: string[]
  customerNames?: string[]
  settlementId?: string
  settlementCodes?: string[]
  quantities?: string[]
  unitAmounts?: string[]
  amounts?: string[]
  roomCodes?: string[]
  returnStatuses?: string[]
  itemTypes?: string[]
  createdBys?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
}

export function fetchDepositDeductions(params?: DepositDeductionListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.contractId) query.contractId = params.contractId
  if (params?.contractCodes?.length) query.contractCodes = params.contractCodes.join(',')
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.settlementId) query.settlementId = params.settlementId
  if (params?.settlementCodes?.length) query.settlementCodes = params.settlementCodes.join(',')
  if (params?.quantities?.length) query.quantities = params.quantities.join(',')
  if (params?.unitAmounts?.length) query.unitAmounts = params.unitAmounts.join(',')
  if (params?.amounts?.length) query.amounts = params.amounts.join(',')
  if (params?.roomCodes?.length) query.roomCodes = params.roomCodes.join(',')
  if (params?.returnStatuses?.length) query.returnStatuses = params.returnStatuses.join(',')
  if (params?.itemTypes?.length) query.itemTypes = params.itemTypes.join(',')
  if (params?.createdBys?.length) query.createdBys = params.createdBys.join(',')
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<PaginatedResult<DepositDeductionRecord>>('/deposit-deductions', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchDepositDeduction(id: string) {
  return request.get<DepositDeductionRecord>(`/deposit-deductions/${id}`)
}
