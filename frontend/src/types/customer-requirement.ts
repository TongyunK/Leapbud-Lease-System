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
