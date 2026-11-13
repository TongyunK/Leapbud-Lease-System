export const CASH_FLOW_DIRECTIONS = ['in', 'out'] as const
export type CashFlowDirection = (typeof CASH_FLOW_DIRECTIONS)[number]

export const CASH_FLOW_SOURCE_TYPES = ['receipt', 'refund_order'] as const
export type CashFlowSourceType = (typeof CASH_FLOW_SOURCE_TYPES)[number]

export type CashFlowRecord = {
  id: string
  flowCode: string
  direction: CashFlowDirection | string
  amount: number
  flowDate: string
  paymentMethod: string
  sourceType: CashFlowSourceType | string
  sourceId: string
  contractId: string | null
  contractCode: string
  customerId: string
  customerCode: string
  customerName: string
  receiptId: string | null
  receiptCode: string
  refundOrderId: string | null
  refundOrderCode: string
  receiptCount?: number
  refundOrderCount?: number
  remark: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}
