/** 收款方式（与合约一致） */
export const RECEIPT_PAYMENT_METHODS = ['轉數快', '銀行過數', '支票', '現金'] as const

export type ReceiptPaymentMethod = (typeof RECEIPT_PAYMENT_METHODS)[number]

/** 收据分类：定金收据 / 发票收据 */
export const RECEIPT_KINDS = ['booking_deposit', 'invoice'] as const
export type ReceiptKind = (typeof RECEIPT_KINDS)[number]

/** 收据收款凭证附件（不限数量与格式） */
export interface ReceiptAttachmentRecord {
  id: string
  receiptId: string
  fileName: string
  sortOrder: number
  /** 公开/外部地址时可直接作链接；本地文件可走鉴权流 */
  publicUrl?: string
}

/** 收据分摊到单张应收的明细 */
export interface ReceiptAllocationRecord {
  id: string
  receiptId: string
  receivableId: string
  receivableCode: string
  invoiceId: string | null
  invoiceCode: string
  amount: number | null
  sortOrder: number
  remark: string
}

export interface ReceiptRecord {
  id: string
  receiptCode: string
  /** booking_deposit=定金收据；invoice=发票收据 */
  kind: ReceiptKind | string
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
  /** 分摊明细（一张收据可覆盖多张应收） */
  allocations?: ReceiptAllocationRecord[]
  attachments?: ReceiptAttachmentRecord[]
  cashFlowCount?: number
  changeLog: string | null
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}
