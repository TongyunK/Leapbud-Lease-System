export const REFUND_ORDER_STATUSES = ['pending', 'partial', 'paid', 'cancelled'] as const
export type RefundOrderStatus = (typeof REFUND_ORDER_STATUSES)[number]

export type RefundItemRecord = {
  id: string
  itemType: string
  description: string
  amount: number
  receivableId: string | null
  receiptId: string | null
  settlementItemId: string | null
  sortOrder: number
  remark: string
}

export type RefundOrderAttachmentRecord = {
  id: string
  refundOrderId: string
  fileName: string
  sortOrder: number
  publicUrl?: string
}

export type RefundOrderRecord = {
  id: string
  refundCode: string
  status: RefundOrderStatus | string
  contractId: string
  contractCode: string
  customerId: string
  customerCode: string
  customerName: string
  roomId: string | null
  roomCode: string
  roomName: string
  settlementId: string | null
  settlementCode: string
  settlementType: string
  settlementStatus?: string
  settlementRefundDueTotal?: number
  settlementRefundedTotal?: number
  settlementRefundRemaining?: number
  depositRefundId: string | null
  /** 应退总额 */
  amount: number
  /** 已打款合计 */
  paidAmount: number
  /** 待退金额 */
  remainingAmount: number
  refundDate: string
  paymentMethod: string
  handlerId: string | null
  handler: string
  remark: string
  itemCount?: number
  attachmentCount?: number
  cashFlowCount?: number
  items: RefundItemRecord[]
  attachments?: RefundOrderAttachmentRecord[]
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export function refundOrderRemaining(row: Pick<RefundOrderRecord, 'amount' | 'paidAmount' | 'remainingAmount'>) {
  if (row.remainingAmount != null && Number.isFinite(Number(row.remainingAmount))) {
    return Math.max(0, Math.round(Number(row.remainingAmount) * 100) / 100)
  }
  return Math.max(
    0,
    Math.round((Number(row.amount || 0) - Number(row.paidAmount || 0)) * 100) / 100,
  )
}

export function canDisburseRefundOrder(status: string | null | undefined) {
  const s = (status || '').trim()
  return s === 'pending' || s === 'partial'
}
