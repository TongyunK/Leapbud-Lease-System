export interface InvoiceServiceDetailListRecord {
  id: string
  invoiceId: string
  invoiceCode: string
  contractId: string
  contractCode: string
  customerId: string
  customerName: string
  roomId: string
  roomCode: string
  description: string | null
  quantity: number | null
  unitAmount: number | null
  subtotal: number | null
  remark: string | null
  sortOrder: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}
