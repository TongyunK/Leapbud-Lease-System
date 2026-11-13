/** 按金扣除：结算明细中的 DAMAGE_DEDUCTION / PENALTY_DEDUCTION */
export interface DepositDeductionRecord {
  id: string
  settlementId: string
  settlementCode: string
  contractId: string
  contractCode: string
  customerId: string
  customerName: string
  roomId: string
  roomCode: string
  itemType: string
  description: string
  quantity: number
  unitAmount: number
  amount: number
  /** 与 amount 同值，兼容旧列表列名 */
  subtotal: number
  returnStatus: string
  sourceLoanItemId: string | null
  sourceLoanItemDescription: string
  remark: string
  sortOrder: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}
