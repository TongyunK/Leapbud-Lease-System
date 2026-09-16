export interface ReceivableRecord {
  id: string
  receivableCode: string
  invoiceId: string
  invoiceCode: string
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
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}
