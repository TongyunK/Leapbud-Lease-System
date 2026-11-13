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

export type ContractLoanItemWritePayload = {
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
  loanItems?: ContractLoanItemWritePayload[]
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

/** 签约中取消合约：定金结算方式 */
export type CancelBookingDepositAction = 'refund_all' | 'partial' | 'defer'
/** 签约中取消合约：已收发票现金处理 */
export type CancelPaidInvoiceAction = 'refund_now' | 'defer'

export type CancelContractInvoiceRow = {
  id: string
  invoiceCode: string
  status: string
  invoiceType: string
  totalAmount: number
  receivedAmount: number
  /** 已收中来自定金抵扣的金额 */
  depositAppliedAmount?: number
  /** 已收中来自现金收据的金额 */
  cashReceivedAmount?: number
  openAmount: number
  paid: boolean
}

export type CancelContractPreview = {
  contract: {
    id: string
    contractCode: string
    status: string
    customerId: string
    customerCode: string
    customerName: string
    roomId: string
    roomCode: string
    roomName: string
    startDate: string
    endDate: string
    cancellable: boolean
  }
  unpaidInvoices: CancelContractInvoiceRow[]
  paidInvoices: CancelContractInvoiceRow[]
  paidInvoiceReceivedTotal: number
  depositAppliedTotal: number
  cashReceivedTotal: number
  bookingDeposit: {
    receiptId: string | null
    receiptCode: string
    principal: number
    applied: number
    refunded: number
    forfeited: number
    /** 定金侧当前可用余额（不含已抵扣到发票） */
    balance: number
  }
  suggestedCancelDate: string
}

export type CancelInvoiceSettleLine = {
  invoiceId: string
  /** 立刻退还的另收 */
  refundAmount: number
  /** 扣留不退的另收 */
  deductAmount: number
}

export type ConductCancelContractPayload = {
  cancelDate: string
  remark?: string
  /** 兼容旧客户端；有 invoiceSettlements 时以后者为准 */
  bookingDepositAction?: CancelBookingDepositAction
  bookingDepositForfeitAmount?: number
  bookingDepositRefundAmount?: number
  paidInvoiceAction?: CancelPaidInvoiceAction
  invoiceSettlements?: CancelInvoiceSettleLine[]
  /** 立刻退／冲销办理日；缺省跟 cancelDate */
  refundDate?: string
}

export type ConductCancelContractResult = {
  contract: ContractRecord
  cancelledInvoiceCount: number
  /** 保留的定金抵扣动账合计 */
  depositAppliedKept?: number
  /** 发票变更中记为已退的定金抵扣（不改动定金动账） */
  invoiceDepositRefundNoted?: number
  /** 发票侧扣留的定金抵扣 */
  invoiceDepositForfeited?: number
  invoiceDepositDeferred?: number
  cashRefunded: number
  cashDeferred: number
  cashForfeited?: number
  bookingDepositRefunded: number
  bookingDepositForfeited: number
  bookingDepositDeferred: number
  paidInvoiceAction: CancelPaidInvoiceAction
  bookingDepositAction: CancelBookingDepositAction
  settlementId?: string | null
  settlementCode?: string
  refundOrderId?: string | null
  refundOrderCode?: string
}

export function fetchCancelContractPreviewApi(contractId: string) {
  return request.get<CancelContractPreview>(`/contracts/${contractId}/cancel-preview`)
}

export function conductCancelContractApi(
  contractId: string,
  payload: ConductCancelContractPayload,
  opts?: { silentError?: boolean },
) {
  return request.post<ConductCancelContractResult>(
    `/contracts/${contractId}/cancel`,
    payload,
    opts,
  )
}

/** 已取消合约：暂不退后续办理预览 */
export type CancelRefundPreview = {
  contract: {
    id: string
    contractCode: string
    status: string
    customerId: string
    customerCode: string
    customerName: string
    roomId: string
    roomCode: string
    roomName: string
    cancelled: boolean
  }
  cash: {
    amount: number
    depositOffsetNoted: number
    receipts: Array<{
      id: string
      receiptCode: string
      amount: number
      paymentDate: string
      paymentMethod: string
    }>
    invoices: Array<{
      id: string
      invoiceCode: string
      cashAmount: number
      depositOffsetPending: number
    }>
  }
  bookingDeposit: {
    receiptId: string | null
    receiptCode: string
    principal: number
    applied: number
    refunded: number
    forfeited: number
    balance: number
  }
  hasPending: boolean
  suggestedRefundDate: string
}

export type ConductCancelRefundPayload = {
  refundDate: string
  refundCash?: boolean
  refundBookingDeposit?: boolean
  remark?: string
  paymentMethod?: string
}

export type ConductCancelRefundResult = {
  contract: ContractRecord
  cashRefunded: number
  depositOffsetNoted: number
  bookingDepositRefunded: number
  refundDate: string
  settlementId?: string | null
  settlementCode?: string
  refundOrderId?: string | null
  refundOrderCode?: string
}

export function fetchCancelRefundPreviewApi(contractId: string) {
  return request.get<CancelRefundPreview>(`/contracts/${contractId}/cancel-refund-preview`)
}

export function conductCancelRefundApi(
  contractId: string,
  payload: ConductCancelRefundPayload,
  opts?: { silentError?: boolean },
) {
  return request.post<ConductCancelRefundResult>(
    `/contracts/${contractId}/cancel-refund`,
    payload,
    opts,
  )
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
