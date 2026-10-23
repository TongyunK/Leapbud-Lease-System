export interface CustomerRequirementRecord {
  id: string
  requirementCode: string
  customerId: string
  customerCode: string
  customerName: string
  salesManagerId: string | null
  salesManager: string
  requirementDate: string
  status: string
  /** long 长租 / short 短租 */
  rentalType: string
  leaseDuration: string
  budget: number | null
  content: string
  remark: string
  attachment: string
  sizeConfigId: string | null
  sizeConfigLabel: string
  acConfigId: string | null
  acConfigLabel: string
  windowConfigId: string | null
  windowConfigLabel: string
  contractCount?: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

/** 客户需求状态（图2） */
export const CUSTOMER_REQUIREMENT_STATUSES = ['跟進中', '已簽約', '已取消'] as const

export type CustomerRequirementStatus = (typeof CUSTOMER_REQUIREMENT_STATUSES)[number]

/** 需求类型：长租后续走合约；短租可直接开票收据 */
export const CUSTOMER_REQUIREMENT_RENTAL_TYPES = ['long', 'short'] as const

export type CustomerRequirementRentalType = (typeof CUSTOMER_REQUIREMENT_RENTAL_TYPES)[number]
