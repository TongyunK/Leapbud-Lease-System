export type ExpiringSoonUnit = 'day' | 'month'
export type ExpiringSoonStatusMode = 'all' | 'include' | 'exclude'

export type ContractExpiringSoonConfig = {
  amount: number
  unit: ExpiringSoonUnit
  statusMode: ExpiringSoonStatusMode
  statuses: string[]
}

/** 对应 system_settings 一键一值：mail_sending_email_* */
export type MailSmtpConfig = {
  host: string
  port: number
  secure: boolean
  email: string
  /** 已配置时接口回传 ********；保存时留空或掩码表示不改 */
  password: string
  fromName: string
  hasPassword: boolean
}

/** 对应 brand_* 一键一值；公开接口与设置页共用 */
export type BrandingConfig = {
  logoKey: string
  logoUrl: string
  themeColor: string
  title: string
  subtitle: string
}

export type SystemSettings = {
  rentInvoiceLeadDays: number
  loginMaxFailedAttempts: number
  loginLockoutMinutes: number
  loginCaptchaEnabled: boolean
  contractExpiringSoon: ContractExpiringSoonConfig
  mailSmtp: MailSmtpConfig
  branding: BrandingConfig
  updatedAt: string | null
  updatedBy: string | null
}

export type UpdateSystemSettingsPayload = {
  rentInvoiceLeadDays: number
  loginMaxFailedAttempts: number
  loginLockoutMinutes: number
  loginCaptchaEnabled: boolean
  mailSmtp?: UpdateMailSmtpPayload
  branding?: UpdateBrandingPayload
}

export type UpdateBrandingPayload = {
  logoKey?: string
  themeColor: string
  title: string
  subtitle: string
}

export type UpdateMailSmtpPayload = {
  host: string
  port: number
  secure: boolean
  email: string
  password?: string
  fromName?: string
}

export type UpdateContractExpiringSoonPayload = ContractExpiringSoonConfig
