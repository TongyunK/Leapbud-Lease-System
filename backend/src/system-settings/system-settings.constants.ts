/** 租金自动开票：距缴费周期开始日提前多少天开票（含当天） */
export const SETTING_RENT_INVOICE_LEAD_DAYS = 'rent_invoice_lead_days'

/** 默认提前天数（与历史硬编码一致） */
export const DEFAULT_RENT_INVOICE_LEAD_DAYS = 7

/** 合约列表「即将到期」快捷筛选条件（JSON） */
export const SETTING_CONTRACT_EXPIRING_SOON = 'contract_expiring_soon'

/**
 * 系统发信 SMTP（与其它系统参数一样：一键一值）
 * 命名对齐运营侧 data_backup_sending_email_* 风格
 */
export const SETTING_MAIL_SENDING_EMAIL_HOST = 'mail_sending_email_host'
export const SETTING_MAIL_SENDING_EMAIL = 'mail_sending_email'
export const SETTING_MAIL_SENDING_EMAIL_PASSWORD = 'mail_sending_email_password'
export const SETTING_MAIL_SENDING_EMAIL_PORT = 'mail_sending_email_port'
export const SETTING_MAIL_SENDING_EMAIL_SECURE = 'mail_sending_email_secure'
export const SETTING_MAIL_SENDING_FROM_NAME = 'mail_sending_from_name'

/** @deprecated 旧 JSON 整包键；迁移后删除 */
export const SETTING_MAIL_SMTP_LEGACY = 'mail_smtp'

export const MAIL_SETTING_KEYS = [
  SETTING_MAIL_SENDING_EMAIL_HOST,
  SETTING_MAIL_SENDING_EMAIL,
  SETTING_MAIL_SENDING_EMAIL_PASSWORD,
  SETTING_MAIL_SENDING_EMAIL_PORT,
  SETTING_MAIL_SENDING_EMAIL_SECURE,
  SETTING_MAIL_SENDING_FROM_NAME,
] as const

/** 品牌外观：Logo / 主题色 / 公司名称（一键一值） */
export const SETTING_BRAND_LOGO = 'brand_logo'
export const SETTING_BRAND_THEME_COLOR = 'brand_theme_color'
export const SETTING_BRAND_TITLE = 'brand_title'
export const SETTING_BRAND_SUBTITLE = 'brand_subtitle'

export const BRAND_SETTING_KEYS = [
  SETTING_BRAND_LOGO,
  SETTING_BRAND_THEME_COLOR,
  SETTING_BRAND_TITLE,
  SETTING_BRAND_SUBTITLE,
] as const

/** 默认 Logo 使用前端 public 静态资源（非 uploads） */
export const DEFAULT_BRAND_LOGO_URL = '/leapbud_logo.png'

export type BrandingConfig = {
  /** uploads 相对键；空表示使用默认 Logo */
  logoKey: string
  /** 浏览器可直链的 Logo URL */
  logoUrl: string
  /** 主题色（#RRGGBB） */
  themeColor: string
  /** 公司名称（登录小字 / 侧栏主名） */
  title: string
  /** 系统名称（侧栏副标；登录大标题 = 公司名称 + 空格 + 系统名称） */
  subtitle: string
}

export const DEFAULT_BRANDING: BrandingConfig = {
  logoKey: '',
  logoUrl: DEFAULT_BRAND_LOGO_URL,
  themeColor: '#0f4a32',
  title: 'leapbud',
  subtitle: '租賃管理系統',
}

export const BRAND_SETTING_META: Record<
  (typeof BRAND_SETTING_KEYS)[number],
  { label: string; remark: string; sortOrder: number; defaultValue: string }
> = {
  [SETTING_BRAND_LOGO]: {
    label: '系统 Logo',
    remark: '登录页与侧栏 Logo；存 uploads 相对键，空则用默认 /leapbud_logo.png',
    sortOrder: 40,
    defaultValue: '',
  },
  [SETTING_BRAND_THEME_COLOR]: {
    label: '系统主题色',
    remark: '侧栏与登录品牌区主色；影响 --lb-brand / Element Plus 主色',
    sortOrder: 41,
    defaultValue: DEFAULT_BRANDING.themeColor,
  },
  [SETTING_BRAND_TITLE]: {
    label: '公司名称',
    remark: '登录页小字（kicker）与侧栏主名',
    sortOrder: 42,
    defaultValue: DEFAULT_BRANDING.title,
  },
  [SETTING_BRAND_SUBTITLE]: {
    label: '系统名称',
    remark: '侧栏副标；登录大标题自动拼接为「公司名称 + 空格 + 系统名称」',
    sortOrder: 43,
    defaultValue: DEFAULT_BRANDING.subtitle,
  },
}

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{6})$/

export function normalizeThemeColor(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  if (HEX_COLOR_RE.test(s)) return s.toLowerCase()
  return DEFAULT_BRANDING.themeColor
}

export function brandingFromValueMap(
  map: Record<string, string | undefined | null>,
  logoPublicUrl: (key: string) => string | undefined,
): BrandingConfig {
  const logoKey = String(map[SETTING_BRAND_LOGO] ?? '').trim()
  const fromUpload = logoKey ? logoPublicUrl(logoKey) : undefined
  return {
    logoKey,
    logoUrl: fromUpload || DEFAULT_BRAND_LOGO_URL,
    themeColor: normalizeThemeColor(map[SETTING_BRAND_THEME_COLOR]),
    title: String(map[SETTING_BRAND_TITLE] ?? '').trim() || DEFAULT_BRANDING.title,
    subtitle: String(map[SETTING_BRAND_SUBTITLE] ?? '').trim() || DEFAULT_BRANDING.subtitle,
  }
}

export type ExpiringSoonUnit = 'day' | 'month'
export type ExpiringSoonStatusMode = 'all' | 'include' | 'exclude'

export type ContractExpiringSoonConfig = {
  /** 距合约到期日的提前量（含当天） */
  amount: number
  /** 时间单位 */
  unit: ExpiringSoonUnit
  /** 状态：全部 / 仅含 / 排除 */
  statusMode: ExpiringSoonStatusMode
  /** 配合 statusMode 的状态列表 */
  statuses: string[]
}

export const DEFAULT_CONTRACT_EXPIRING_SOON: ContractExpiringSoonConfig = {
  amount: 30,
  unit: 'day',
  statusMode: 'include',
  statuses: ['租賃中', '退租中'],
}

/** 邮件 SMTP（由多条 system_settings 键拼装） */
export type MailSmtpConfig = {
  /** SMTP 主机 */
  host: string
  /** SMTP 端口（常见 587 / 465） */
  port: number
  /** true=SSL（多为 465）；false=STARTTLS（多为 587） */
  secure: boolean
  /** 发件／登录邮箱（同键 mail_sending_email） */
  email: string
  /** SMTP 密码 */
  password: string
  /** 发件人显示名 */
  fromName: string
}

export const DEFAULT_MAIL_SMTP: MailSmtpConfig = {
  host: 'mail.wisesystemtech.com',
  port: 587,
  secure: false,
  email: 'rentalsystem@wisesystemtech.com',
  password: '',
  fromName: 'Leapbud 租賃系統',
}

/** 管理端展示：密码不明文回传 */
export type MailSmtpConfigView = Omit<MailSmtpConfig, 'password'> & {
  /** 是否已配置 SMTP 密码 */
  hasPassword: boolean
  /** 占位；保存时留空或 ******** 表示不改密码 */
  password: string
}

export type SystemSettingKey =
  | typeof SETTING_RENT_INVOICE_LEAD_DAYS
  | typeof SETTING_CONTRACT_EXPIRING_SOON
  | (typeof MAIL_SETTING_KEYS)[number]
  | (typeof BRAND_SETTING_KEYS)[number]

/** 从 key→value 映射拼装邮件配置（password 为库内原值，可能是 enc:v1 密文） */
export function mailSmtpFromValueMap(
  map: Record<string, string | undefined | null>,
): MailSmtpConfig {
  const fallback = { ...DEFAULT_MAIL_SMTP }
  const portRaw = Number.parseInt(String(map[SETTING_MAIL_SENDING_EMAIL_PORT] ?? ''), 10)
  const secureRaw = String(map[SETTING_MAIL_SENDING_EMAIL_SECURE] ?? '').trim().toLowerCase()
  return {
    host: String(map[SETTING_MAIL_SENDING_EMAIL_HOST] ?? '').trim() || fallback.host,
    port:
      Number.isFinite(portRaw) && portRaw > 0 && portRaw <= 65535 ? portRaw : fallback.port,
    secure: secureRaw === 'true' || secureRaw === '1',
    email: String(map[SETTING_MAIL_SENDING_EMAIL] ?? '').trim() || fallback.email,
    password: String(map[SETTING_MAIL_SENDING_EMAIL_PASSWORD] ?? ''),
    fromName: String(map[SETTING_MAIL_SENDING_FROM_NAME] ?? '').trim() || fallback.fromName,
  }
}

export const MAIL_SETTING_META: Record<
  (typeof MAIL_SETTING_KEYS)[number],
  { label: string; remark: string; sortOrder: number; defaultValue: string }
> = {
  [SETTING_MAIL_SENDING_EMAIL_HOST]: {
    label: '系统发信 SMTP 主机',
    remark: '忘记密码等系统邮件 SMTP 主机，如 mail.wisesystemtech.com',
    sortOrder: 30,
    defaultValue: DEFAULT_MAIL_SMTP.host,
  },
  [SETTING_MAIL_SENDING_EMAIL]: {
    label: '系统发信邮箱',
    remark: 'SMTP 登录账号与发件地址，如 rentalsystem@wisesystemtech.com',
    sortOrder: 31,
    defaultValue: DEFAULT_MAIL_SMTP.email,
  },
  [SETTING_MAIL_SENDING_EMAIL_PASSWORD]: {
    label: '系统发送邮箱密码',
    remark: 'SMTP 密码；入库加密（enc:v1）；仅在系统设置中维护，接口回传脱敏',
    sortOrder: 32,
    defaultValue: '',
  },
  [SETTING_MAIL_SENDING_EMAIL_PORT]: {
    label: '系统发信 SMTP 端口',
    remark: '常见 587（STARTTLS）或 465（SSL）',
    sortOrder: 33,
    defaultValue: String(DEFAULT_MAIL_SMTP.port),
  },
  [SETTING_MAIL_SENDING_EMAIL_SECURE]: {
    label: '系统发信 SMTP 使用 SSL',
    remark: 'true=SSL（多为 465）；false=STARTTLS（多为 587）',
    sortOrder: 34,
    defaultValue: DEFAULT_MAIL_SMTP.secure ? 'true' : 'false',
  },
  [SETTING_MAIL_SENDING_FROM_NAME]: {
    label: '系统发信显示名',
    remark: '收件箱中显示的发件人名称',
    sortOrder: 35,
    defaultValue: DEFAULT_MAIL_SMTP.fromName,
  },
}
