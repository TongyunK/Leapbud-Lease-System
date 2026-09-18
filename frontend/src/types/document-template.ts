export type DocumentTemplateType = 'agreement' | 'invoice' | 'receipt'

export interface DocumentTemplateRecord {
  id: string
  name: string
  type: DocumentTemplateType
  fileName: string
  storageKey: string
  enabled: boolean
  remark: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface DocumentFieldDictItem {
  key: string
  label: string
  loop?: boolean
  note?: string
}
