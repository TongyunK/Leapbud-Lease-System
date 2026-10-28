/** 租金自动开票：距缴费周期开始日提前多少天开票（含当天） */
export const SETTING_RENT_INVOICE_LEAD_DAYS = 'rent_invoice_lead_days'

/** 默认提前天数（与历史硬编码一致） */
export const DEFAULT_RENT_INVOICE_LEAD_DAYS = 7

/** 合约列表「即将到期」快捷筛选条件（JSON） */
export const SETTING_CONTRACT_EXPIRING_SOON = 'contract_expiring_soon'

export type ExpiringSoonUnit = 'day' | 'month'
export type ExpiringSoonStatusMode = 'all' | 'include' | 'exclude'

export type ContractExpiringSoonConfig = {
  /** 距合约到期日的提前量（含当天） */
  amount: number
  /** 时间单位 */
  unit: ExpiringSoonUnit
  /** 状态：全部 / 仅含 / 排除 */
  statusMode: ExpiringSoonStatusMode
  /** 配合 statusMode 的状态列表 */
  statuses: string[]
}

export const DEFAULT_CONTRACT_EXPIRING_SOON: ContractExpiringSoonConfig = {
  amount: 30,
  unit: 'day',
  statusMode: 'include',
  statuses: ['租賃中', '退租中'],
}

export type SystemSettingKey =
  | typeof SETTING_RENT_INVOICE_LEAD_DAYS
  | typeof SETTING_CONTRACT_EXPIRING_SOON
