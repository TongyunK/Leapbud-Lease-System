import request from './request'
import type { ContractRecord } from '@/types/contract'
import type { ImportBatchResult } from './customers'
import type { PaginatedResult } from '@/types/pagination'

export type ContractPeriodWritePayload = {
  dateType: string
  dateUnit?: string
  dateValue?: number
  startDate: string
  endDate: string
  sortOrder?: number
}

export type ContractWritePayload = {
  contractCode?: string
  roomId: string
  customerId: string
  salesManagerId?: string | null
  requirementId?: string | null
  startDate?: string | null
  endDate?: string | null
  actualEndDate?: string | null
  leaseType?: string
  status?: string
  roomDeposit?: number | null
  monthlyRent?: number | null
  bookingDeposit?: number | null
  paymentCycle?: string
  electricityRate?: number | null
  miscDeposit?: number | null
  doorKeyQty?: number | null
  mailboxKeyQty?: number | null
  roomNameText?: string
  subleaseMark?: string
  attachment?: string
  remark?: string
  periods?: ContractPeriodWritePayload[]
}

export type ContractListQuery = {
  keyword?: string
  status?: string
  statuses?: string[]
  customerId?: string
  roomId?: string
  requirementId?: string
  roomCodes?: string[]
  customerNames?: string[]
  salesManagers?: string[]
  leaseTypes?: string[]
  paymentCycles?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  startDateFrom?: string
  startDateTo?: string
  endDateFrom?: string
  endDateTo?: string
  createdAtFrom?: string
  createdAtTo?: string
  page?: number
  pageSize?: number
}

export type ContractListPage = PaginatedResult<ContractRecord>

export function fetchContracts(params?: ContractListQuery) {
  const query: Record<string, string | number> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.status) query.status = params.status
  if (params?.statuses?.length) query.statuses = params.statuses.join(',')
  if (params?.customerId) query.customerId = params.customerId
  if (params?.roomId) query.roomId = params.roomId
  if (params?.requirementId) query.requirementId = params.requirementId
  if (params?.roomCodes?.length) query.roomCodes = params.roomCodes.join(',')
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.salesManagers?.length) query.salesManagers = params.salesManagers.join(',')
  if (params?.leaseTypes?.length) query.leaseTypes = params.leaseTypes.join(',')
  if (params?.paymentCycles?.length) query.paymentCycles = params.paymentCycles.join(',')
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.startDateFrom) query.startDateFrom = params.startDateFrom
  if (params?.startDateTo) query.startDateTo = params.startDateTo
  if (params?.endDateFrom) query.endDateFrom = params.endDateFrom
  if (params?.endDateTo) query.endDateTo = params.endDateTo
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<ContractListPage>('/contracts', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchContract(id: string) {
  return request.get<ContractRecord>(`/contracts/${id}`)
}

export function createContractApi(payload: ContractWritePayload) {
  return request.post<ContractRecord>('/contracts', payload)
}

export function updateContractApi(id: string, payload: Partial<ContractWritePayload>) {
  return request.patch<ContractRecord>(`/contracts/${id}`, payload)
}

export function deleteContractApi(id: string) {
  return request.delete<{ success: boolean }>(`/contracts/${id}`)
}

export function batchDeleteContractsApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/contracts/batch-delete',
    { ids },
  )
}

export type ContractImportItem = {
  contractCode?: string
  roomCode: string
  customerCode?: string
  customerName?: string
  salesManager?: string
  requirementCode?: string
  startDate?: string | null
  endDate?: string | null
  actualEndDate?: string | null
  leaseType?: string
  status?: string
  monthlyRent?: number | null
  roomDeposit?: number | null
  bookingDeposit?: number | null
  paymentCycle?: string
  electricityRate?: number | null
  miscDeposit?: number | null
  doorKeyQty?: number | null
  mailboxKeyQty?: number | null
  roomNameText?: string
  subleaseMark?: string
  attachment?: string
  remark?: string
}

export function importContractsApi(items: ContractImportItem[]) {
  return request.post<ImportBatchResult>('/contracts/import', { items })
}
