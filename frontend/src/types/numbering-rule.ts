export type NumberingBizKey =
  | 'customer'
  | 'customerRequirement'
  | 'invoice'
  | 'receipt'

export type NumberingResetCycle = 'none' | 'daily' | 'monthly' | 'yearly'

export interface NumberingRule {
  id: string
  bizKey: NumberingBizKey | null
  name: string
  format: string
  startValue: number
  resetCycle: NumberingResetCycle
  currentSeq: number
  periodKey: string
  active: boolean
  sortOrder: number
  preview: string
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}
