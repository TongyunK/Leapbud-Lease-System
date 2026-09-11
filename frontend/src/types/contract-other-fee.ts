export interface ContractOtherFeeRecord {
  id: string
  contractId: string
  contractCode: string
  terminationId: string | null
  terminationCode: string
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

export interface ContractOtherFeeNestedRecord {
  id?: string
  description: string
  quantity: number
  unitAmount: number
  subtotal?: number
  remark?: string
  sortOrder?: number
}
