export interface ReceivableRecord {
  id: string
  receivableCode: string
  invoiceId: string
  invoiceCode: string
  /** 所属发票类型（来自发票） */
  invoiceType?: string
  /** 所属发票描述（来自发票） */
  invoiceDescription?: string
  contractId: string
  contractCode: string
  customerId: string
  customerCode: string
  customerName: string
  invoiceDate: string
  paymentDueDate: string
  invoiceAmount: number | null
  receivedAmount: number | null
  receivableAmount: number | null
  remark: string | null
  relatedReceiptRef: string | null
  depositRefundId: string | null
  depositRefundCode: string
  receiptCount?: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}
