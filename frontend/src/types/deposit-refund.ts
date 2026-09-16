export interface DepositRefundRecord {
  id: string
  refundCode: string
  contractId: string
  contractCode: string
  customerId: string
  customerCode: string
  customerName: string
  roomId: string
  roomCode: string
  roomName: string
  status: string
  terminationDate: string
  refundDate: string
  totalDeposit: number | null
  actualRefundAmount: number | null
  handlerId: string | null
  handler: string
  voucherImage: string | null
  voucherAttachment: string | null
  remark: string | null
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

/** 按金退还状态（退按金状态） */
export const DEPOSIT_REFUND_STATUSES = ['草稿', '未退按金', '已退按金', '已取消'] as const

export type DepositRefundStatus = (typeof DEPOSIT_REFUND_STATUSES)[number]
