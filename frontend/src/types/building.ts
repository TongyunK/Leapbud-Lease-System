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
  agreementLogo?: string
  apiTemplateSuffix?: string
  logo2?: string
  email: string
  workingHours: string
  invoiceTemplateId?: string | null
  invoiceTemplateName?: string
  invoiceTemplateFileName?: string
  invoiceLogo?: string
  fpsId?: string
  bankAccountHolder?: string
  bankAccount?: string
  chequePaymentBy?: string
  paymentAdvice?: string
  receiptTemplateId?: string | null
  receiptTemplateName?: string
  receiptTemplateFileName?: string
  receiptTopLogo?: string
  receiptLeftLogo?: string
  receiptRightLogo?: string
  roomIds: string[]
  buildingConfig?: string
  useWbaNumber?: string
  active: boolean
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}
