export type ExpiringSoonUnit = 'day' | 'month'
export type ExpiringSoonStatusMode = 'all' | 'include' | 'exclude'

export type ContractExpiringSoonConfig = {
  amount: number
  unit: ExpiringSoonUnit
  statusMode: ExpiringSoonStatusMode
  statuses: string[]
}

export type SystemSettings = {
  rentInvoiceLeadDays: number
  contractExpiringSoon: ContractExpiringSoonConfig
  updatedAt: string | null
  updatedBy: string | null
}

export type UpdateSystemSettingsPayload = {
  rentInvoiceLeadDays: number
}

export type UpdateContractExpiringSoonPayload = ContractExpiringSoonConfig
