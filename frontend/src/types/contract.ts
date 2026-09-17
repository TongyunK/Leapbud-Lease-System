export interface ContractPeriodRecord {
  id?: string
  contractId?: string
  dateType: string
  dateUnit: string
  dateValue: number
  startDate: string
  endDate: string
  sortOrder?: number
}

export interface ContractRecord {
  id: string
  contractCode: string
  roomId: string
  roomCode: string
  roomName: string
  buildingId: string | null
  buildingName: string
  customerId: string
  customerCode: string
  customerName: string
  salesManagerId: string | null
  salesManager: string
  requirementId: string | null
  requirementCode: string
  startDate: string
  endDate: string
  actualEndDate: string
  leaseType: string
  status: string
  roomDeposit: number | null
  monthlyRent: number | null
  bookingDeposit: number | null
  paymentCycle: string
  electricityRate: number | null
  miscDeposit: number | null
  doorKeyQty: number
  doorKeyDeposit: number | null
  mailboxKeyQty: number
  mailboxKeyDeposit: number | null
  roomNameText: string
  subleaseMark: string
  attachment: string
  remark: string
  periods: ContractPeriodRecord[]
  invoiceCount?: number
  receivableCount?: number
  receiptCount?: number
  periodCount?: number
  terminationCount?: number
  otherFeeCount?: number
  depositDeductionCount?: number
  depositRefundCount?: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

/** 合约状态（对齐业务截图） */
export const CONTRACT_STATUSES = [
  '草稿',
  '簽約中',
  '已簽約',
  '交吉中',
  '租賃中',
  '已完成',
  '退租中',
  '已退租',
  '已取消',
  '已續約',
] as const
export type ContractStatus = (typeof CONTRACT_STATUSES)[number]

/** 缴费周期（暂仍前端常量；可后续配置化） */
export const CONTRACT_PAYMENT_CYCLES = ['月繳', '季繳', '半年繳', '年繳', '1年半', '2年'] as const

/** 合约期日期单位 */
export const CONTRACT_PERIOD_UNITS = ['月', '日'] as const
