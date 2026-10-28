/**
 * 各列表行内编辑白名单（仅 superAdmin 可见铅笔）。
 * type: select | text | number | date
 */
export type InlineEditType = 'select' | 'text' | 'number' | 'date'

export type InlineEditFieldSpec = {
  type: InlineEditType
  /** number */
  precision?: number
  min?: number
  max?: number
}

/** 合约列表 */
export const CONTRACT_INLINE_FIELDS = {
  status: { type: 'select' },
  paymentCycle: { type: 'select' },
  paymentMethod: { type: 'select' },
  remark: { type: 'text' },
  monthlyRent: { type: 'number', precision: 2, min: 0 },
  roomDeposit: { type: 'number', precision: 2, min: 0 },
  miscDeposit: { type: 'number', precision: 2, min: 0 },
  bookingDeposit: { type: 'number', precision: 2, min: 0 },
  electricityRate: { type: 'number', precision: 2, min: 0 },
  paymentDate: { type: 'date' },
  startDate: { type: 'date' },
  endDate: { type: 'date' },
} as const satisfies Record<string, InlineEditFieldSpec>

export type ContractInlineField = keyof typeof CONTRACT_INLINE_FIELDS

/** 房间列表（状态列为占用填充态，不可手改；可改租金等） */
export const ROOM_INLINE_FIELDS = {
  remark: { type: 'text' },
  description: { type: 'text' },
  monthlyRent: { type: 'number', precision: 2, min: 0 },
  dailyRent: { type: 'number', precision: 2, min: 0 },
  hourlyRent: { type: 'number', precision: 2, min: 0 },
  sizeSqft: { type: 'number', precision: 0, min: 0 },
} as const satisfies Record<string, InlineEditFieldSpec>

export type RoomInlineField = keyof typeof ROOM_INLINE_FIELDS

/** 客户列表 */
export const CUSTOMER_INLINE_FIELDS = {
  status: { type: 'select' },
  remark: { type: 'text' },
  name: { type: 'text' },
  whatsapp: { type: 'text' },
  mobilePhone: { type: 'text' },
  contactPhone: { type: 'text' },
  email: { type: 'text' },
} as const satisfies Record<string, InlineEditFieldSpec>

export type CustomerInlineField = keyof typeof CUSTOMER_INLINE_FIELDS

/** 收据列表 */
export const RECEIPT_INLINE_FIELDS = {
  paymentMethod: { type: 'select' },
  paymentDate: { type: 'date' },
  amount: { type: 'number', precision: 2, min: 0 },
  remark: { type: 'text' },
} as const satisfies Record<string, InlineEditFieldSpec>

export type ReceiptInlineField = keyof typeof RECEIPT_INLINE_FIELDS

/** 发票列表 */
export const INVOICE_INLINE_FIELDS = {
  status: { type: 'select' },
  invoiceDate: { type: 'date' },
  paymentDueDate: { type: 'date' },
  remark: { type: 'text' },
} as const satisfies Record<string, InlineEditFieldSpec>

export type InvoiceInlineField = keyof typeof INVOICE_INLINE_FIELDS
