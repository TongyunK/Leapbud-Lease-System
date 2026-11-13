/** 应收下属收据摘要（详情 / 表单编辑回填） */
export interface ReceivableReceiptSummary {
  id: string
  receiptCode: string
  paymentDate: string
  paymentMethod: string
  amount: number | null
  remark?: string | null
  attachmentCount?: number
}

/** 定金抵扣动账（详情展示来源定金收据） */
export interface ReceivableBookingDepositApply {
  id: string
  amount: number
  movementDate: string
  bookingDepositReceiptId: string
  bookingDepositReceiptCode: string
  remark?: string
}

export interface ReceivableRecord {
  id: string
  receivableCode: string
  invoiceId: string
  invoiceCode: string
  /** 所属发票类型（来自发票） */
  invoiceType?: string
  /** 所属发票描述（来自发票） */
  invoiceDescription?: string
  /** 所属发票状态（已取消 → 失效应收） */
  invoiceStatus?: string
  contractId: string
  contractCode: string
  customerId: string
  customerCode: string
  customerName: string
  invoiceDate: string
  paymentDueDate: string
  invoiceAmount: number | null
  receivedAmount: number | null
  /** 已退金额（冲销另收／实退按金等累计） */
  refundedAmount: number | null
  receivableAmount: number | null
  remark: string | null
  relatedReceiptRef: string | null
  depositRefundId: string | null
  depositRefundCode: string
  receiptCount?: number
  cashFlowCount?: number
  /** 关联收据（一对多；列表接口可能为空，详情有值） */
  receipts?: ReceivableReceiptSummary[]
  /** 定金抵扣动账（详情） */
  bookingDepositApplies?: ReceivableBookingDepositApply[]
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}
