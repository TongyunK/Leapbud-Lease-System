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
  whatsappTemplates?: Array<{
    id: string
    label: string
    templateName: string
    categoryId: string
    categoryCode: string
    categoryLabel: string
    active: boolean
  }>
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
  whatsappBusinessNumberId?: string | null
  whatsappBusinessNumberLabel?: string
  whatsappBusinessPhoneNumber?: string
  whatsappAutoSendEnabled?: boolean
  active: boolean
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}
