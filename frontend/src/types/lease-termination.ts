import type { ContractOtherFeeNestedRecord } from '@/types/contract-other-fee'

export interface LeaseTerminationRecord {
  id: string
  terminationCode: string
  contractId: string
  contractCode: string
  customerId: string
  customerCode: string
  customerName: string
  roomId: string
  roomCode: string
  roomName: string
  buildingName: string
  reason: string | null
  terminationDate: string
  noticeAttachment: string | null
  doorKeyReturnedQty: number
  smartCardReturnedQty: number
  siteCondition: string | null
  remark: string | null
  relatedDepositRefund: string | null
  otherFees: ContractOtherFeeNestedRecord[]
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}
