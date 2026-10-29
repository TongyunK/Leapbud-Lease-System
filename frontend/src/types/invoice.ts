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

/** 开票来源：合约发票 / 短租发票 */
export type InvoiceSource = 'contract' | 'short_term'

export interface InvoiceRecord {
  id: string
  invoiceCode: string
  /** contract=合约发票；short_term=短租发票 */
  source?: InvoiceSource | string
  contractId: string | null
  contractCode: string
  customerId: string
  customerCode: string
  customerName: string
  roomId: string
  roomCode: string
  roomName: string
  roomSizeSqft?: number | null
  invoiceType: string
  /** manual=用户手动；auto=系统自动 */
  billingKind?: string
  periodStart?: string
  periodEnd?: string
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
  rentalStartDate?: string
  rentalEndDate?: string
  rentalDurationText?: string
  referredByCustomerId?: string | null
  referredByCustomerCode?: string
  referredByCustomerName?: string
  remark: string | null
  serviceDetails: InvoiceServiceDetailRecord[]
  receivableCount?: number
  receiptCount?: number
  serviceDetailCount?: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

/** 发票状态 */
export const INVOICE_STATUSES = ['待開票', '已開票', '已取消'] as const

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/** 发票类型存储值（英文；短租除外）。展示走 i18n，描述字段跟此英文值 */
export const INVOICE_TYPES = [
  '會議室短租',
  'Deposit',
  'Others',
  '1, Charging Period',
  /** @deprecated 旧导入兼容，展示等同 Others */
  '10, Other charges',
] as const

export type InvoiceType = (typeof INVOICE_TYPES)[number]

/** 合约发票可选类型（不含短租；顺序：Deposit / Others / Charging Period） */
export const CONTRACT_INVOICE_TYPES = ['Deposit', 'Others', '1, Charging Period'] as const

/** 短租发票固定类型 */
export const SHORT_TERM_INVOICE_TYPE = '會議室短租' as const

/** 合约发票默认类型（手工新增） */
export const DEFAULT_CONTRACT_INVOICE_TYPE = 'Others' as const

/** invoiceType → i18n 后缀（invoice.types.*）；旧值映射到新文案 */
export const INVOICE_TYPE_I18N_KEY: Record<string, string> = {
  會議室短租: 'meetingRoomShort',
  Deposit: 'deposit',
  Others: 'others',
  '1, Charging Period': 'chargingPeriod',
  '10, Other charges': 'others',
}

/** 合约票类型归一（旧 Other charges → Others） */
export function normalizeContractInvoiceType(raw?: string | null): string {
  const v = (raw || '').trim()
  if (v === '10, Other charges') return 'Others'
  if ((CONTRACT_INVOICE_TYPES as readonly string[]).includes(v)) return v
  return DEFAULT_CONTRACT_INVOICE_TYPE
}

/** 开票产生方式（与后端 Invoice.billingKind 一致） */
export const INVOICE_BILLING_KINDS = ['manual', 'auto'] as const

export type InvoiceBillingKind = (typeof INVOICE_BILLING_KINDS)[number]

export function normalizeInvoiceBillingKind(raw?: string | null): InvoiceBillingKind {
  const v = (raw || '').trim()
  // 兼容旧值 deposit / rent（迁移前）
  if (v === 'auto' || v === 'deposit' || v === 'rent') return 'auto'
  return 'manual'
}

/** 是否系统自动开票 */
export function isSystemGeneratedInvoice(billingKind?: string | null): boolean {
  return normalizeInvoiceBillingKind(billingKind) === 'auto'
}
