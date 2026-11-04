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

export type ContractOtherFeeWritePayload = {
  description: string
  quantity: number
  unitAmount: number
  subtotal?: number
  remark?: string
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
  occupancyMode?: 'whole' | 'part' | string
  partLabel?: string
  status?: string
  roomDeposit?: number | null
  monthlyRent?: number | null
  bookingDeposit?: number | null
  paymentDate?: string | null
  paymentCycle?: string
  paymentMethod?: string
  paymentVoucher?: string
  electricityRate?: number | null
  miscDeposit?: number | null
  doorKeyQty?: number | null
  mailboxKeyQty?: number | null
  roomNameText?: string
  subleaseMark?: string
  attachment?: string
  remark?: string
  periods?: ContractPeriodWritePayload[]
  otherFees?: ContractOtherFeeWritePayload[]
  /** 直接开单：须有签约文件，保存后状态为租赁中 */
  issueNow?: boolean
}

export type ContractListQuery = {
  keyword?: string
  status?: string
  statuses?: string[]
  customerId?: string
  roomId?: string
  requirementId?: string
  buildingIds?: string[]
  contractCodes?: string[]
  roomCodes?: string[]
  customerNames?: string[]
  salesManagers?: string[]
  leaseTypes?: string[]
  /** whole | part | part:A */
  occupancyKeys?: string[]
  monthlyRents?: string[]
  paymentCycles?: string[]
  paymentMethods?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  startDateFrom?: string
  startDateTo?: string
  endDateFrom?: string
  endDateTo?: string
  createdAtFrom?: string
  createdAtTo?: string
  createdBys?: string[]
  createdAtEmpty?: boolean
  startDateEmpty?: boolean
  endDateEmpty?: boolean
  /** 頁頭「即將到期」：後端按系統設置套用 */
  expiringSoon?: boolean
  /** 頁頭「當前應收>0」 */
  hasOutstandingReceivable?: boolean
  /** 收租情况：collected | uncollected */
  rentCollectionStatuses?: string[]
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
  if (params?.buildingIds?.length) query.buildingIds = params.buildingIds.join(',')
  if (params?.contractCodes?.length) query.contractCodes = params.contractCodes.join(',')
  if (params?.roomCodes?.length) query.roomCodes = params.roomCodes.join(',')
  if (params?.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params?.salesManagers?.length) query.salesManagers = params.salesManagers.join(',')
  if (params?.leaseTypes?.length) query.leaseTypes = params.leaseTypes.join(',')
  if (params?.occupancyKeys?.length) query.occupancyKeys = params.occupancyKeys.join(',')
  if (params?.monthlyRents?.length) query.monthlyRents = params.monthlyRents.join(',')
  if (params?.paymentCycles?.length) query.paymentCycles = params.paymentCycles.join(',')
  if (params?.paymentMethods?.length) query.paymentMethods = params.paymentMethods.join(',')
  if (params?.sortBy) query.sortBy = params.sortBy
  if (params?.sortDir) query.sortDir = params.sortDir
  if (params?.startDateFrom) query.startDateFrom = params.startDateFrom
  if (params?.startDateTo) query.startDateTo = params.startDateTo
  if (params?.endDateFrom) query.endDateFrom = params.endDateFrom
  if (params?.endDateTo) query.endDateTo = params.endDateTo
  if (params?.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params?.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params?.createdBys?.length) query.createdBys = params.createdBys.join(',')
  if (params?.createdAtEmpty) query.createdAtEmpty = 'true'
  if (params?.startDateEmpty) query.startDateEmpty = 'true'
  if (params?.endDateEmpty) query.endDateEmpty = 'true'
  if (params?.expiringSoon) query.expiringSoon = 1
  if (params?.hasOutstandingReceivable) query.hasOutstandingReceivable = 1
  if (params?.rentCollectionStatuses?.length) {
    query.rentCollectionStatuses = params.rentCollectionStatuses.join(',')
  }
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.pageSize = params.pageSize
  return request.get<ContractListPage>('/contracts', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export type ContractBuildingCount = {
  buildingId: string
  count: number
}

export function fetchContractBuildingCounts() {
  return request.get<ContractBuildingCount[]>('/contracts/building-counts')
}

export type ContractOccupancyCounts = {
  all: number
  whole: number
  part: number
}

export function fetchContractOccupancyCounts() {
  return request.get<ContractOccupancyCounts>('/contracts/stats/occupancy')
}

export type ContractExpiringSoonCount = {
  count: number
  config: {
    amount: number
    unit: 'day' | 'month'
    statusMode: 'all' | 'include' | 'exclude'
    statuses: string[]
  }
}

export function fetchContractExpiringSoonCount() {
  return request.get<ContractExpiringSoonCount>('/contracts/stats/expiring-soon')
}

export function fetchContractOutstandingReceivableCount() {
  return request.get<{ count: number }>('/contracts/stats/outstanding-receivable')
}

export type IssueBlockedAlertItem = {
  id: string
  contractCode: string
  secondPeriodStart: string
  /** 距第 2 期开始天数；负数表示已过开始日 */
  daysUntilSecond: number
  roomCode: string
  customerName: string
}

export type IssueBlockedAlertResult = {
  leadDays: number
  total: number
  items: IssueBlockedAlertItem[]
}

/** 紧急待开单（全量，不受列表分页限制；按紧急程度排序） */
export function fetchIssueBlockedAlerts() {
  return request.get<IssueBlockedAlertResult>('/contracts/alerts/issue-blocked')
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

/** 开单：上传租客签约文件，签约中 → 租赁中 */
export function openContractOrderApi(id: string, attachment: string) {
  return request.post<ContractRecord>(`/contracts/${id}/open-order`, { attachment })
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
  paymentDate?: string | null
  paymentCycle?: string
  paymentMethod?: string
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
