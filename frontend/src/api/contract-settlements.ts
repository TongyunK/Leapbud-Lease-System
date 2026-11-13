import request from './request'
import type { ImportBatchResult } from './customers'
import type {
  ContractChangeLogRecord,
  ContractSettlementRecord,
  ReceivableWriteoffRecord,
} from '@/types/contract-settlement'
import type { SettlementVacateImportPayload } from '@/utils/settlementVacateExport'
import type { PaginatedResult } from '@/types/pagination'

export type ContractSettlementListQuery = {
  keyword?: string
  contractId?: string
  customerId?: string
  settlementCodes?: string[]
  types?: string[]
  statuses?: string[]
  refundStatuses?: string[]
  collectStatuses?: string[]
  contractCodes?: string[]
  customerNames?: string[]
  roomCodes?: string[]
  reasons?: string[]
  doorKeyReturnedQtys?: string[]
  smartCardReturnedQtys?: string[]
  itemCounts?: string[]
  writeoffCounts?: string[]
  refundOrderCounts?: string[]
  refundDueTotals?: string[]
  refundedTotals?: string[]
  refundRemainings?: string[]
  collectDueTotals?: string[]
  collectedTotals?: string[]
  collectRemainings?: string[]
  createdBys?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  settlementDateFrom?: string
  settlementDateTo?: string
  createdAtFrom?: string
  createdAtTo?: string
  /** @deprecated use types */
  type?: string
  /** @deprecated use refundStatuses */
  status?: string
  page?: number
  pageSize?: number
}

export type VacateDeductionItemPayload = {
  description: string
  quantity?: number
  unitAmount?: number
  amount?: number
  returnStatus?: string
  sourceLoanItemId?: string
  remark?: string
  sortOrder?: number
}

export type VacateSettlementWritePayload = {
  contractId?: string
  contractCode?: string
  roomCode?: string
  customerName?: string
  customerId?: string
  roomId?: string
  terminationDate?: string
  terminationKind?: string
  reason?: string
  noticeAttachment?: string
  doorKeyReturnedQty?: number
  smartCardReturnedQty?: number
  siteCondition?: string
  legacyTerminationCode?: string
  remark?: string
  deductionItems?: VacateDeductionItemPayload[]
}

function toListParams(params?: ContractSettlementListQuery) {
  const query: Record<string, string | number> = {}
  if (!params) return undefined
  if (params.keyword) query.keyword = params.keyword
  if (params.contractId) query.contractId = params.contractId
  if (params.customerId) query.customerId = params.customerId
  if (params.settlementCodes?.length) query.settlementCodes = params.settlementCodes.join(',')
  if (params.types?.length) query.types = params.types.join(',')
  else if (params.type) query.types = params.type
  if (params.refundStatuses?.length) query.refundStatuses = params.refundStatuses.join(',')
  else if (params.statuses?.length) query.refundStatuses = params.statuses.join(',')
  else if (params.status) query.refundStatuses = params.status
  if (params.collectStatuses?.length) query.collectStatuses = params.collectStatuses.join(',')
  if (params.contractCodes?.length) query.contractCodes = params.contractCodes.join(',')
  if (params.customerNames?.length) query.customerNames = params.customerNames.join(',')
  if (params.roomCodes?.length) query.roomCodes = params.roomCodes.join(',')
  if (params.reasons?.length) query.reasons = params.reasons.join(',')
  if (params.doorKeyReturnedQtys?.length) {
    query.doorKeyReturnedQtys = params.doorKeyReturnedQtys.join(',')
  }
  if (params.smartCardReturnedQtys?.length) {
    query.smartCardReturnedQtys = params.smartCardReturnedQtys.join(',')
  }
  if (params.itemCounts?.length) query.itemCounts = params.itemCounts.join(',')
  if (params.writeoffCounts?.length) query.writeoffCounts = params.writeoffCounts.join(',')
  if (params.refundOrderCounts?.length) {
    query.refundOrderCounts = params.refundOrderCounts.join(',')
  }
  if (params.refundDueTotals?.length) query.refundDueTotals = params.refundDueTotals.join(',')
  if (params.refundedTotals?.length) query.refundedTotals = params.refundedTotals.join(',')
  if (params.refundRemainings?.length) {
    query.refundRemainings = params.refundRemainings.join(',')
  }
  if (params.collectDueTotals?.length) query.collectDueTotals = params.collectDueTotals.join(',')
  if (params.collectedTotals?.length) query.collectedTotals = params.collectedTotals.join(',')
  if (params.collectRemainings?.length) {
    query.collectRemainings = params.collectRemainings.join(',')
  }
  if (params.createdBys?.length) query.createdBys = params.createdBys.join(',')
  if (params.sortBy) query.sortBy = params.sortBy
  if (params.sortDir) query.sortDir = params.sortDir
  if (params.settlementDateFrom) query.settlementDateFrom = params.settlementDateFrom
  if (params.settlementDateTo) query.settlementDateTo = params.settlementDateTo
  if (params.createdAtFrom) query.createdAtFrom = params.createdAtFrom
  if (params.createdAtTo) query.createdAtTo = params.createdAtTo
  if (params.page != null) query.page = params.page
  if (params.pageSize != null) query.pageSize = params.pageSize
  return Object.keys(query).length ? query : undefined
}

export function fetchContractSettlements(params?: ContractSettlementListQuery) {
  return request.get<PaginatedResult<ContractSettlementRecord>>('/contract-settlements', {
    params: toListParams(params),
  })
}

export function fetchContractSettlement(id: string) {
  return request.get<ContractSettlementRecord>(`/contract-settlements/${id}`)
}

export function deleteContractSettlementApi(id: string, opts?: { silentError?: boolean }) {
  return request.delete<{ success: boolean }>(`/contract-settlements/${id}`, opts)
}

export function fetchSettlementsByContract(contractId: string) {
  return request.get<ContractSettlementRecord[]>(
    `/contract-settlements/by-contract/${contractId}`,
  )
}

export function fetchSettlementWriteoffs(settlementId: string) {
  return request.get<ReceivableWriteoffRecord[]>(
    `/contract-settlements/${settlementId}/writeoffs`,
  )
}

export function fetchWriteoffsByReceivable(receivableId: string) {
  return request.get<ReceivableWriteoffRecord[]>(
    `/contract-settlements/writeoffs/by-receivable/${receivableId}`,
  )
}

export function fetchContractChangeLogs(contractId: string) {
  return request.get<ContractChangeLogRecord[]>(
    `/contract-settlements/change-logs/by-contract/${contractId}`,
  )
}

export type TerminateLoanCheckStatus = 'returned' | 'damaged' | 'missing'

export type TerminateConductPreview = {
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
    doorKeyQty: number
    mailboxKeyQty: number
    doorKeyDeposit: number
    mailboxKeyDeposit: number
    terminable: boolean
  }
  loanItems: Array<{
    id: string
    description: string
    quantity: number
    unitAmount: number
    subtotal: number
    remark: string
  }>
  totalDeposit: number
  /** 按金发票已收合计 */
  depositPaid: number
  /** 按金发票未收合计（退租将作废） */
  depositUnpaid: number
  unpaidDepositReceivables: Array<{
    id: string
    receivableCode: string
    invoiceId: string
    invoiceCode: string
    openAmount: number
    receivedAmount: number
  }>
  /** 建议实退基数（未扣损坏前，即已交按金） */
  suggestedDepositRefund: number
  bookingDeposit: {
    receiptId: string | null
    receiptCode: string
    principal: number
    applied: number
    refunded: number
    balance: number
  }
  unsettledReceivables: Array<{
    id: string
    receivableCode: string
    invoiceCode: string
    receivableAmount: number
    receivedAmount: number
    openAmount: number
  }>
  unsettledTotal: number
  /** 最后一期缴费周期首日（YYYY-MM-DD）；自此日起默认可视为到期退租 */
  lastBillingPeriodStart: string | null
  suggestedKind: 'expiry' | 'early'
  existingSettlement: { id: string; settlementCode: string } | null
}

export type ConductVacateSettlementPayload = {
  contractId: string
  terminationDate: string
  terminationKind?: 'expiry' | 'early'
  reason?: string
  noticeAttachment?: string
  doorKeyReturnedQty?: number
  smartCardReturnedQty?: number
  /** 房门匙未还扣除（省略则后端按未还数量×单价） */
  doorKeyDeductAmount?: number
  /** 智能卡未还扣除（省略则后端按未还数量×单价） */
  smartCardDeductAmount?: number
  siteCondition?: string
  remark?: string
  loanChecks?: Array<{
    loanFeeId: string
    status: TerminateLoanCheckStatus
    deductAmount?: number
  }>
  extraDeductions?: Array<{
    description: string
    quantity: number
    unitAmount: number
    subtotal?: number
    remark?: string
    sortOrder?: number
  }>
  allowUnsettledReceivables?: boolean
  createDepositRefund?: boolean
  refundDate?: string
  actualRefundAmount?: number
  bookingDepositRefundAmount?: number
  depositRefundStatus?: string
  /** 超额赔偿是否先用定金余额抵扣 */
  applyBookingDepositToExcess?: boolean
}

export type ConductVacateSettlementResult = {
  settlement: ContractSettlementRecord
  depositRefundId: string | null
  depositRefundCode: string
  deductionTotal: number
  actualRefundAmount: number
  bookingDepositRefundAmount: number
  terminationKind: 'expiry' | 'early'
  settlementId: string
  settlementCode: string
  refundOrderId?: string | null
  refundOrderCode?: string
  excessCompensationGross?: number
  excessCompensation?: number
  bookingOffsetToExcess?: number
  excessInvoiceId?: string | null
  excessReceivableId?: string | null
  excessInvoiceCode?: string
}

export function fetchTerminateConductPreviewApi(contractId: string) {
  return request.get<TerminateConductPreview>('/contract-settlements/conduct-preview', {
    params: { contractId },
  })
}

export function conductVacateSettlementApi(
  payload: ConductVacateSettlementPayload,
  opts?: { silentError?: boolean },
) {
  return request.post<ConductVacateSettlementResult>(
    '/contract-settlements/conduct-vacate',
    payload,
    opts,
  )
}

export function createVacateSettlementApi(payload: VacateSettlementWritePayload) {
  return request.post<ContractSettlementRecord>('/contract-settlements/vacate', payload)
}

export function updateVacateSettlementApi(
  id: string,
  payload: Partial<VacateSettlementWritePayload>,
) {
  return request.patch<ContractSettlementRecord>(`/contract-settlements/vacate/${id}`, payload)
}

export function importVacateSettlementsApi(items: SettlementVacateImportPayload[]) {
  return request.post<ImportBatchResult>('/contract-settlements/import-vacate', { items })
}
