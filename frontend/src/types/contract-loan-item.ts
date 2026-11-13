export interface ContractLoanItemRecord {
  id: string
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

/** 合约表单嵌套借出物品 */
export interface ContractLoanItemNestedRecord {
  id?: string
  description: string
  quantity: number
  unitAmount: number
  subtotal?: number
  remark?: string
  sortOrder?: number
}
