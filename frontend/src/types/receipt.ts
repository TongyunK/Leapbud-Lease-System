export const RECEIPT_PAYMENT_METHODS = [
  '銀行轉帳',
  '支票',
  '現金',
  'FPS',
  '信用卡',
  '其他',
] as const

export type ReceiptPaymentMethod = (typeof RECEIPT_PAYMENT_METHODS)[number]

export interface ReceiptRecord {
  id: string
  receiptCode: string
  customerId: string
  customerCode: string
  customerName: string
  contractId: string | null
  contractCode: string
  invoiceId: string | null
  invoiceCode: string
  receivableId: string | null
  receivableCode: string
  paymentDate: string
  paymentMethod: string
  amount: number | null
  remark: string | null
  voucher1: string | null
  voucher2: string | null
  changeLog: string | null
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}
