export interface BuildingRecord {
  id: string
  name: string
  address: string
  addressEn: string
  manager: string
  managerPhone: string
  agreementTemplateId?: string | null
  agreementTemplateName?: string
  agreementTemplateFileName?: string
  apiTemplateSuffix?: string
  email: string
  workingHours: string
  invoiceTemplateId?: string | null
  invoiceTemplateName?: string
  invoiceTemplateFileName?: string
  fpsId?: string
  bankAccountHolder?: string
  bankAccount?: string
  chequePaymentBy?: string
  paymentAdvice?: string
  receiptTemplateId?: string | null
  receiptTemplateName?: string
  receiptTemplateFileName?: string
  roomIds: string[]
  useWbaNumber?: string
  active: boolean
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}
