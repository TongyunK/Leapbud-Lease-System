/** 按金退还凭证附件（不限数量与格式） */
export interface DepositRefundAttachmentRecord {
  id: string
  depositRefundId: string
  fileName: string
  sortOrder: number
  /** 公开/外部地址时可直接作链接；本地文件可走鉴权流 */
  publicUrl?: string
}

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
  /** 应退按金上限（分次退总额） */
  refundDueAmount?: number | null
  /** 累计已退按金 */
  actualRefundAmount: number | null
  /** 一并退还的定金挂账余额 */
  bookingDepositRefundAmount: number | null
  handlerId: string | null
  handler: string
  /** @deprecated 旧单路径字段；新凭证见 attachments */
  voucherImage: string | null
  /** @deprecated 旧单路径字段；新凭证见 attachments */
  voucherAttachment: string | null
  attachments?: DepositRefundAttachmentRecord[]
  remark: string | null
  receivableCount?: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

/** 按金退还状态（退按金状态） */
export const DEPOSIT_REFUND_STATUSES = ['草稿', '未退', '部分已退', '已退', '已取消'] as const

export type DepositRefundStatus = (typeof DEPOSIT_REFUND_STATUSES)[number]
