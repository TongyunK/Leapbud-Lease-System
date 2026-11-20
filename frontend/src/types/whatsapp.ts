export interface WhatsappBusinessNumber {
  id: string
  label: string
  phoneNumber: string
  remark: string
  sortOrder: number
  active: boolean
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}

export type WhatsappCategoryBadgeTone =
  | 'idle'
  | 'signing'
  | 'contracting'
  | 'leased'
  | 'leasing'
  | 'terminating'
  | 'active'
  | 'disabled'
  | 'neutral'

export interface WhatsappTemplateCategory {
  id: string
  code: string
  label: string
  badgeTone: WhatsappCategoryBadgeTone | string
  remark: string
  sortOrder: number
  active: boolean
  templateCount: number
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}

export interface WhatsappTemplateBuildingRef {
  id: string
  name: string
}

export interface WhatsappTemplate {
  id: string
  buildingIds: string[]
  buildings: WhatsappTemplateBuildingRef[]
  buildingNames: string
  categoryId: string
  categoryCode: string
  categoryLabel: string
  categoryBadgeTone: WhatsappCategoryBadgeTone | string
  label: string
  templateName: string
  remark: string
  diagramKey: string
  diagramUrl: string
  sortOrder: number
  active: boolean
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}
