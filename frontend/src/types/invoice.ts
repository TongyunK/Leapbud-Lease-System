export interface InvoiceServiceDetailRecord {
  id?: string
  invoiceId?: string
  description: string
  quantity: number | null
  unitAmount: number | null
  subtotal: number | null
  remark?: string | null
  sortOrder?: number
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}

export interface InvoiceRecord {
  id: string
  invoiceCode: string
  contractId: string
  contractCode: string
  customerId: string
  customerCode: string
  customerName: string
  roomId: string
  roomCode: string
  roomName: string
  invoiceType: string
  description: string
  amount: number | null
  status: string
  invoiceDate: string
  paymentDueDate: string
  salesManagerId: string | null
  salesManager: string
  relatedReceivableRef: string | null
  attachment: string | null
  roomNameText: string | null
  notes: string | null
  whatsappNumber: string | null
  shortTermRentalCode: string | null
  remark: string | null
  serviceDetails: InvoiceServiceDetailRecord[]
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

/** 发票状态 */
export const INVOICE_STATUSES = ['待開票', '已開票', '已取消'] as const

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/** 发票类型（旧系统取值） */
export const INVOICE_TYPES = [
  '會議室短租',
  'Deposit',
  '1, Charging Period',
  '10, Other charges',
] as const

export type InvoiceType = (typeof INVOICE_TYPES)[number]
