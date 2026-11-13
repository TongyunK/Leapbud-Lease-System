export const CONTRACT_SETTLEMENT_TYPES = ['VACATE', 'CANCEL'] as const
export type ContractSettlementType = (typeof CONTRACT_SETTLEMENT_TYPES)[number]

/** 应退状态 */
export const CONTRACT_SETTLEMENT_REFUND_STATUSES = [
  'pending_refund',
  'partial',
  'settled',
] as const
export type ContractSettlementRefundStatus =
  (typeof CONTRACT_SETTLEMENT_REFUND_STATUSES)[number]

/** @deprecated 使用 CONTRACT_SETTLEMENT_REFUND_STATUSES */
export const CONTRACT_SETTLEMENT_STATUSES = CONTRACT_SETTLEMENT_REFUND_STATUSES
/** @deprecated 使用 ContractSettlementRefundStatus */
export type ContractSettlementStatus = ContractSettlementRefundStatus

/** 应收（应补）状态 */
export const CONTRACT_SETTLEMENT_COLLECT_STATUSES = [
  'none',
  'pending_collect',
  'partial',
  'settled',
] as const
export type ContractSettlementCollectStatus =
  (typeof CONTRACT_SETTLEMENT_COLLECT_STATUSES)[number]

export type ContractSettlementItemRecord = {
  id: string
  itemType: string
  description: string
  amount: number
  quantity: number
  unitAmount: number
  returnStatus: string
  sourceLoanItemId: string | null
  receivableId: string | null
  invoiceId: string | null
  sortOrder: number
  remark: string
}

export type ContractSettlementRecord = {
  id: string
  settlementCode: string
  type: ContractSettlementType | string
  refundStatus: ContractSettlementRefundStatus | string
  /** @deprecated 等同 refundStatus */
  status?: ContractSettlementRefundStatus | string
  collectStatus: ContractSettlementCollectStatus | string
  contractId: string
  contractCode: string
  customerId: string
  customerCode: string
  customerName: string
  roomId: string
  roomCode: string
  roomName: string
  settlementDate: string
  terminationDate: string
  depositTotal: number
  deductionTotal: number
  waiverTotal: number
  additionalTotal: number
  refundDueTotal: number
  refundedTotal: number
  /** 待退金额（应退 − 已退） */
  refundRemaining: number
  collectDueTotal: number
  collectedTotal: number
  /** 待收金额（应补 − 已收） */
  collectRemaining: number
  depositRefundId: string | null
  /** 退租类型：expiry=到期，early=提前 */
  terminationKind: string
  reason: string
  noticeAttachment: string
  doorKeyReturnedQty: number
  smartCardReturnedQty: number
  siteCondition: string
  /** 旧退租编号（历史回填） */
  legacyTerminationCode: string
  remark: string
  itemCount?: number
  writeoffCount?: number
  refundOrderCount?: number
  items: ContractSettlementItemRecord[]
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export type ReceivableWriteoffRecord = {
  id: string
  writeoffCode: string
  receivableId: string
  receivableCode: string
  amount: number
  direction: string
  reasonType: string
  settlementId: string | null
  settlementItemId: string | null
  receiptId: string | null
  writeoffDate: string
  remark: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export type ContractChangeLogRecord = {
  id: string
  contractId: string
  changeType: string
  fieldPath: string
  beforeJson: string
  afterJson: string
  refType: string
  refId: string
  summary: string
  createdBy: string
  createdAt: string
}
