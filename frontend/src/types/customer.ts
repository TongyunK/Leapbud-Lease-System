export interface OccupantContactFields {
  name: string
  whatsapp: string
  mobilePhone: string
  contactPhone: string
  email: string
  fax: string
  address: string
  idCardNo: string
  idCardImage: string
  addressProofCopy: string
  remark: string
}

/** 客户在租／过往合约摘要（由占用中合约推导） */
export interface CustomerLeaseSummary {
  contractId: string
  contractCode: string
  roomId: string
  roomCode: string
  roomName: string
  occupancyMode: string
  partLabel: string
  status: string
  startDate: string
  endDate: string
}

export interface CustomerRecord {
  id: string
  customerCode: string
  name: string
  status: string
  accountManagerId: string | null
  accountManager: string
  companyNameZh: string
  companyNameEn: string
  businessRegNo: string
  businessNature: string
  businessRegCopy: string
  remark: string
  source: string
  buildingId: string | null
  buildingName: string
  /** 协议打印模板覆盖（空则用所属大厦默认协议模板） */
  agreementTemplateId: string | null
  agreementTemplateName?: string
  primaryOccupantId: string | null
  primaryOccupant: OccupantContactFields & { id: string } | null
  /** 列表展示：主要联络人姓名 */
  primaryContact: string
  /** 列表展示：主要使用者手机 */
  mobilePhone: string
  occupantCount: number
  requirementCount: number
  contractCount?: number
  invoiceCount?: number
  receivableCount?: number
  receiptCount?: number
  terminationCount?: number
  depositRefundCount?: number
  /** 占用中合约 → 目前在租房间／合约 */
  activeLeases?: CustomerLeaseSummary[]
  /** 过往合约（详情接口返回；列表可为空） */
  pastLeases?: CustomerLeaseSummary[]
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface OccupantRecord {
  id: string
  name: string
  customerId: string | null
  customerCode: string
  customerName: string
  relatedCustomerName: string
  whatsapp: string
  mobilePhone: string
  contactPhone: string
  email: string
  fax: string
  address: string
  idCardNo: string
  idCardImage: string
  addressProofCopy: string
  remark: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

/** 客户状态（与导入数据一致） */
export const CUSTOMER_STATUSES = [
  '新客戶',
  '已查詢',
  '簽約中',
  '租賃中',
  '退租中',
  '已退租',
] as const

export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number]
