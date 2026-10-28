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

/** 合约级借出物品（嵌套） */
export interface ContractOtherFeeNestedRecord {
  id?: string
  description: string
  quantity: number
  unitAmount: number
  subtotal?: number
  remark?: string
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
  /** whole=整租；part=分租某份位 */
  occupancyMode: string
  /** 分租份位标签，如 A */
  partLabel: string
  status: string
  roomDeposit: number | null
  monthlyRent: number | null
  bookingDeposit: number | null
  /** 已收订金的收款日期 YYYY-MM-DD */
  paymentDate: string
  paymentCycle: string
  /** 收款方式：轉數快 / 銀行過數 / 支票 / 現金 */
  paymentMethod: string
  /** 定金收款凭证（图片或文件路径） */
  paymentVoucher: string
  /** 定金收据 ID（开单后生成） */
  bookingDepositReceiptId?: string | null
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
  otherFees?: ContractOtherFeeNestedRecord[]
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

/** 合约状态（表单 / 筛选可选） */
export const CONTRACT_STATUSES = [
  '簽約中',
  '租賃中',
  '退租中',
  '已退租',
  '已取消',
  '已續約',
] as const
export type ContractStatus = (typeof CONTRACT_STATUSES)[number]

/** 已下线状态 → 编辑回填时的映射（历史数据展示仍用原文字） */
const CONTRACT_STATUS_LEGACY_TO_FORM: Record<string, ContractStatus> = {
  草稿: '簽約中',
  已簽約: '簽約中',
  交吉中: '簽約中',
  已完成: '已退租',
}

export function coerceContractFormStatus(raw?: string | null): ContractStatus {
  const s = (raw || '').trim()
  if ((CONTRACT_STATUSES as readonly string[]).includes(s)) return s as ContractStatus
  return CONTRACT_STATUS_LEGACY_TO_FORM[s] || CONTRACT_STATUSES[0]
}

/** 是否处于「签约中」族（含历史归并态）；仅此时可编辑 / 取消合约 */
export function isSigningContractStatus(raw?: string | null): boolean {
  return coerceContractFormStatus(raw) === '簽約中'
}

/**
 * 行内/表单可选状态：非签约中不可选「已取消」（已是已取消的仍保留该项以便展示）。
 * 其他状态如需结束请走退租流程。
 */
export function contractStatusOptionsForEdit(currentStatus?: string | null): ContractStatus[] {
  const current = (currentStatus || '').trim()
  return CONTRACT_STATUSES.filter((s) => {
    if (s !== '已取消') return true
    return isSigningContractStatus(current) || current === '已取消'
  })
}

type ContractOccupancyLike = {
  occupancyMode?: string | null
  partLabel?: string | null
  subleaseMark?: string | null
}

/** 筛选 / API：whole | part | part:A */
export function contractOccupancyFilterKey(row: ContractOccupancyLike): string {
  const mode = String(row.occupancyMode || '')
    .trim()
    .toLowerCase()
  if (mode === 'part') {
    const label = String(row.partLabel || row.subleaseMark || '')
      .trim()
      .toUpperCase()
    return label ? `part:${label}` : 'part'
  }
  return 'whole'
}

/** 列表展示：整租 / 分租·A */
export function formatContractOccupancyLabel(
  row: ContractOccupancyLike,
  labels: { whole: string; part: string },
): string {
  const key = contractOccupancyFilterKey(row)
  if (key === 'whole') return labels.whole
  if (key === 'part') return labels.part
  return `${labels.part}·${key.slice(5)}`
}

/** 缴费周期（显示格式：名称-月数） */
export const CONTRACT_PAYMENT_CYCLES = [
  '月繳-1',
  '季繳-3',
  '半年繳-6',
  '年繳-12',
  '1年半-18',
  '2年-24',
] as const

/** 旧值 → 新显示格式（编辑回填） */
const CONTRACT_PAYMENT_CYCLE_LEGACY: Record<string, (typeof CONTRACT_PAYMENT_CYCLES)[number]> = {
  月繳: '月繳-1',
  季繳: '季繳-3',
  半年繳: '半年繳-6',
  年繳: '年繳-12',
  '1年半': '1年半-18',
  '2年': '2年-24',
}

export function coerceContractPaymentCycle(raw?: string | null): string {
  const s = (raw || '').trim()
  if (!s) return CONTRACT_PAYMENT_CYCLES[0]
  if ((CONTRACT_PAYMENT_CYCLES as readonly string[]).includes(s)) return s
  return CONTRACT_PAYMENT_CYCLE_LEGACY[s] || s
}

/** 收款方式 */
export const CONTRACT_PAYMENT_METHODS = ['轉數快', '銀行過數', '支票', '現金'] as const

/** 合约期日期单位 */
export const CONTRACT_PERIOD_UNITS = ['月', '日'] as const
