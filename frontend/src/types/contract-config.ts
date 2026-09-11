export type ContractConfigType = 'periodType' | 'leaseType' | 'keyDeposit'

export interface ContractConfigOption {
  id: string
  type: ContractConfigType
  code: string
  label: string
  unitPrice: number | null
  sortOrder: number
  active: boolean
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}

export const KEY_DEPOSIT_CODES = {
  door: 'door_key',
  mailbox: 'mailbox_key',
} as const
