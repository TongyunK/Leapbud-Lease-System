import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { auditActorLabel, auditUserSelect } from '../common/audit'
import { roomImagePublicUrl } from '../common/dto-mappers'
import { decryptSecret, encryptSecret } from '../common/secret-box'
import {
  BRAND_SETTING_KEYS,
  BRAND_SETTING_META,
  DEFAULT_BRANDING,
  DEFAULT_CONTRACT_EXPIRING_SOON,
  DEFAULT_MAIL_SMTP,
  DEFAULT_RENT_INVOICE_LEAD_DAYS,
  LOGIN_SETTING_KEYS,
  LOGIN_SETTING_META,
  MAIL_SETTING_KEYS,
  MAIL_SETTING_META,
  SETTING_BRAND_LOGO,
  SETTING_BRAND_SUBTITLE,
  SETTING_BRAND_THEME_COLOR,
  SETTING_BRAND_TITLE,
  SETTING_CONTRACT_EXPIRING_SOON,
  SETTING_LOGIN_CAPTCHA_ENABLED,
  SETTING_LOGIN_LOCKOUT_MINUTES,
  SETTING_LOGIN_MAX_FAILED_ATTEMPTS,
  SETTING_MAIL_SENDING_EMAIL,
  SETTING_MAIL_SENDING_EMAIL_HOST,
  SETTING_MAIL_SENDING_EMAIL_PASSWORD,
  SETTING_MAIL_SENDING_EMAIL_PORT,
  SETTING_MAIL_SENDING_EMAIL_SECURE,
  SETTING_MAIL_SENDING_FROM_NAME,
  SETTING_MAIL_SMTP_LEGACY,
  SETTING_RENT_INVOICE_LEAD_DAYS,
  brandingFromValueMap,
  mailSmtpFromValueMap,
  normalizeThemeColor,
  parseLoginCaptchaEnabled,
  parseLoginLockoutMinutes,
  parseLoginMaxFailedAttempts,
  type BrandingConfig,
  type ContractExpiringSoonConfig,
  type ExpiringSoonStatusMode,
  type ExpiringSoonUnit,
  type MailSmtpConfig,
  type MailSmtpConfigView,
} from './system-settings.constants'
import {
  UpdateBrandingDto,
  UpdateContractExpiringSoonDto,
  UpdateMailSmtpDto,
  UpdateSystemSettingsDto,
} from './dto/system-setting.dto'

export type SystemSettingsView = {
  rentInvoiceLeadDays: number
  loginMaxFailedAttempts: number
  loginLockoutMinutes: number
  loginCaptchaEnabled: boolean
  contractExpiringSoon: ContractExpiringSoonConfig
  mailSmtp: MailSmtpConfigView
  branding: BrandingConfig
  updatedAt: string | null
  updatedBy: string | null
}

const PASSWORD_MASK = '********'

@Injectable()
export class SystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseLeadDays(raw: string | null | undefined): number {
    const n = Number.parseInt(String(raw ?? '').trim(), 10)
    if (!Number.isFinite(n) || n < 1) return DEFAULT_RENT_INVOICE_LEAD_DAYS
    return Math.min(90, n)
  }

  parseExpiringSoon(raw: string | null | undefined): ContractExpiringSoonConfig {
    const fallback = { ...DEFAULT_CONTRACT_EXPIRING_SOON, statuses: [...DEFAULT_CONTRACT_EXPIRING_SOON.statuses] }
    try {
      const o = JSON.parse(String(raw || '{}')) as Partial<ContractExpiringSoonConfig>
      if (!o || typeof o !== 'object') return fallback
      const unit: ExpiringSoonUnit = o.unit === 'month' ? 'month' : 'day'
      const amountMax = unit === 'month' ? 36 : 365
      let amount = Math.trunc(Number(o.amount))
      if (!Number.isFinite(amount) || amount < 1) amount = fallback.amount
      amount = Math.min(amountMax, amount)
      const statusMode: ExpiringSoonStatusMode =
        o.statusMode === 'include' || o.statusMode === 'exclude' || o.statusMode === 'all'
          ? o.statusMode
          : fallback.statusMode
      const statuses = Array.isArray(o.statuses)
        ? [...new Set(o.statuses.map((s) => String(s || '').trim()).filter(Boolean))].slice(0, 32)
        : [...fallback.statuses]
      return { amount, unit, statusMode, statuses }
    } catch {
      return fallback
    }
  }

  private toMailSmtpView(cfg: MailSmtpConfig): MailSmtpConfigView {
    /** cfg.password 可能是 enc:v1 密文；管理端回传明文便于核对 */
    const hasPassword = Boolean(String(cfg.password || '').trim())
    let password = ''
    if (hasPassword) {
      try {
        password = decryptSecret(cfg.password)
      } catch {
        password = ''
      }
    }
    return {
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      email: cfg.email,
      fromName: cfg.fromName,
      hasPassword,
      password,
    }
  }

  /** 业务侧明文密码（发信用） */
  private withDecryptedMailPassword(cfg: MailSmtpConfig): MailSmtpConfig {
    try {
      return { ...cfg, password: decryptSecret(cfg.password) }
    } catch {
      return { ...cfg, password: '' }
    }
  }

  /** 业务侧读取：租金开票提前天数 */
  async getRentInvoiceLeadDays(): Promise<number> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTING_RENT_INVOICE_LEAD_DAYS },
      select: { value: true },
    })
    return this.parseLeadDays(row?.value)
  }

  /** 业务侧读取：登录锁定参数 */
  async getLoginLockoutConfig(): Promise<{
    maxFailedAttempts: number
    lockoutMinutes: number
  }> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [...LOGIN_SETTING_KEYS] } },
      select: { key: true, value: true },
    })
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value
    return {
      maxFailedAttempts: parseLoginMaxFailedAttempts(map[SETTING_LOGIN_MAX_FAILED_ATTEMPTS]),
      lockoutMinutes: parseLoginLockoutMinutes(map[SETTING_LOGIN_LOCKOUT_MINUTES]),
    }
  }

  /** 业务侧／公开：登录是否开启图形验证码 */
  async isLoginCaptchaEnabled(): Promise<boolean> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTING_LOGIN_CAPTCHA_ENABLED },
      select: { value: true },
    })
    return parseLoginCaptchaEnabled(row?.value)
  }

  /** 业务侧读取：合约「即将到期」筛选条件 */
  async getContractExpiringSoon(): Promise<ContractExpiringSoonConfig> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTING_CONTRACT_EXPIRING_SOON },
      select: { value: true },
    })
    return this.parseExpiringSoon(row?.value)
  }

  /** 业务侧读取：完整 SMTP（密码已解密；一键一值拼装） */
  async getMailSmtp(): Promise<MailSmtpConfig> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [...MAIL_SETTING_KEYS] } },
      select: { key: true, value: true },
    })
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value
    return this.withDecryptedMailPassword(mailSmtpFromValueMap(map))
  }

  private async loadBrandingMap(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [...BRAND_SETTING_KEYS] } },
      select: { key: true, value: true },
    })
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value
    return map
  }

  /** 公开：登录页／侧栏品牌（无敏感字段） */
  async getBranding(): Promise<BrandingConfig> {
    const map = await this.loadBrandingMap()
    return brandingFromValueMap(map, roomImagePublicUrl)
  }

  async getView(): Promise<SystemSettingsView> {
    const [leadRow, expiringRow, mailRows, brandRows, loginRows] = await Promise.all([
      this.prisma.systemSetting.findUnique({
        where: { key: SETTING_RENT_INVOICE_LEAD_DAYS },
        include: { updatedByUser: { select: auditUserSelect } },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: SETTING_CONTRACT_EXPIRING_SOON },
        include: { updatedByUser: { select: auditUserSelect } },
      }),
      this.prisma.systemSetting.findMany({
        where: { key: { in: [...MAIL_SETTING_KEYS] } },
        include: { updatedByUser: { select: auditUserSelect } },
      }),
      this.prisma.systemSetting.findMany({
        where: { key: { in: [...BRAND_SETTING_KEYS] } },
        include: { updatedByUser: { select: auditUserSelect } },
      }),
      this.prisma.systemSetting.findMany({
        where: { key: { in: [...LOGIN_SETTING_KEYS] } },
        include: { updatedByUser: { select: auditUserSelect } },
      }),
    ])

    const mailMap: Record<string, string> = {}
    for (const r of mailRows) mailMap[r.key] = r.value
    const brandMap: Record<string, string> = {}
    for (const r of brandRows) brandMap[r.key] = r.value
    const loginMap: Record<string, string> = {}
    for (const r of loginRows) loginMap[r.key] = r.value

    const candidates = [leadRow, expiringRow, ...mailRows, ...brandRows, ...loginRows].filter(
      Boolean,
    ) as Array<NonNullable<typeof leadRow>>
    const newer = candidates.reduce<(typeof leadRow) | null>((acc, row) => {
      if (!row?.updatedAt) return acc
      if (!acc?.updatedAt) return row
      return row.updatedAt >= acc.updatedAt ? row : acc
    }, null)

    return {
      rentInvoiceLeadDays: this.parseLeadDays(leadRow?.value),
      loginMaxFailedAttempts: parseLoginMaxFailedAttempts(
        loginMap[SETTING_LOGIN_MAX_FAILED_ATTEMPTS],
      ),
      loginLockoutMinutes: parseLoginLockoutMinutes(loginMap[SETTING_LOGIN_LOCKOUT_MINUTES]),
      loginCaptchaEnabled: parseLoginCaptchaEnabled(loginMap[SETTING_LOGIN_CAPTCHA_ENABLED]),
      contractExpiringSoon: this.parseExpiringSoon(expiringRow?.value),
      mailSmtp: this.toMailSmtpView(mailSmtpFromValueMap(mailMap)),
      branding: brandingFromValueMap(brandMap, roomImagePublicUrl),
      updatedAt: newer?.updatedAt ? newer.updatedAt.toISOString() : null,
      updatedBy: auditActorLabel(newer?.updatedByUser) || null,
    }
  }

  async update(dto: UpdateSystemSettingsDto, actorId?: string | null): Promise<SystemSettingsView> {
    const days = Math.trunc(Number(dto.rentInvoiceLeadDays))
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      throw new BadRequestException('rentInvoiceLeadDays must be an integer between 1 and 90')
    }
    const maxFailed = Math.trunc(Number(dto.loginMaxFailedAttempts))
    if (!Number.isFinite(maxFailed) || maxFailed < 1 || maxFailed > 30) {
      throw new BadRequestException('loginMaxFailedAttempts must be an integer between 1 and 30')
    }
    const lockMinutes = Math.trunc(Number(dto.loginLockoutMinutes))
    if (!Number.isFinite(lockMinutes) || lockMinutes < 1 || lockMinutes > 1440) {
      throw new BadRequestException('loginLockoutMinutes must be an integer between 1 and 1440')
    }

    await this.prisma.systemSetting.upsert({
      where: { key: SETTING_RENT_INVOICE_LEAD_DAYS },
      create: {
        key: SETTING_RENT_INVOICE_LEAD_DAYS,
        value: String(days),
        label: '租金自動開票提前天數',
        remark: '距下一繳費週期開始日還有多少天時，自動開立該期租金發票（含當天）。預設 7。',
        sortOrder: 10,
        createdById: actorId || null,
        updatedById: actorId || null,
      },
      update: {
        value: String(days),
        updatedById: actorId || null,
      },
    })

    await Promise.all([
      this.upsertOneSetting(SETTING_LOGIN_MAX_FAILED_ATTEMPTS, String(maxFailed), actorId),
      this.upsertOneSetting(SETTING_LOGIN_LOCKOUT_MINUTES, String(lockMinutes), actorId),
      this.upsertOneSetting(
        SETTING_LOGIN_CAPTCHA_ENABLED,
        dto.loginCaptchaEnabled === true ? 'true' : 'false',
        actorId,
      ),
    ])

    if (dto.mailSmtp) {
      await this.upsertMailSmtp(dto.mailSmtp, actorId)
    }
    if (dto.branding) {
      await this.upsertBranding(dto.branding, actorId)
    }

    return this.getView()
  }

  async updateBranding(dto: UpdateBrandingDto, actorId?: string | null): Promise<SystemSettingsView> {
    await this.upsertBranding(dto, actorId)
    return this.getView()
  }

  async updateMailSmtp(dto: UpdateMailSmtpDto, actorId?: string | null): Promise<SystemSettingsView> {
    await this.upsertMailSmtp(dto, actorId)
    return this.getView()
  }

  private async upsertOneSetting(
    key:
      | (typeof MAIL_SETTING_KEYS)[number]
      | (typeof BRAND_SETTING_KEYS)[number]
      | (typeof LOGIN_SETTING_KEYS)[number],
    value: string,
    actorId?: string | null,
  ) {
    const meta =
      key in MAIL_SETTING_META
        ? MAIL_SETTING_META[key as (typeof MAIL_SETTING_KEYS)[number]]
        : key in LOGIN_SETTING_META
          ? LOGIN_SETTING_META[key as (typeof LOGIN_SETTING_KEYS)[number]]
          : BRAND_SETTING_META[key as (typeof BRAND_SETTING_KEYS)[number]]
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: {
        id: `sysset_${key}`,
        key,
        value,
        label: meta.label,
        remark: meta.remark,
        sortOrder: meta.sortOrder,
        createdById: actorId || null,
        updatedById: actorId || null,
      },
      update: {
        value,
        label: meta.label,
        remark: meta.remark,
        sortOrder: meta.sortOrder,
        updatedById: actorId || null,
      },
    })
  }

  private async upsertBranding(dto: UpdateBrandingDto, actorId?: string | null) {
    const themeColor = normalizeThemeColor(dto.themeColor)
    if (themeColor !== String(dto.themeColor || '').trim().toLowerCase()) {
      throw new BadRequestException('主題色須為 #RRGGBB 格式')
    }
    const title = String(dto.title || '').trim()
    const subtitle = String(dto.subtitle || '').trim()
    if (!title) throw new BadRequestException('請填寫公司名稱')
    if (!subtitle) throw new BadRequestException('請填寫系統名稱')

    let logoKey = String(dto.logoKey ?? '').trim()
    if (logoKey.includes('..')) {
      throw new BadRequestException('Logo 路徑無效')
    }
    if (logoKey && /^https?:\/\//i.test(logoKey)) {
      throw new BadRequestException('Logo 請上傳後使用系統路徑，勿填外部 URL')
    }
    logoKey = logoKey.replace(/^\/+/, '').replace(/^files\//, '')

    await Promise.all([
      this.upsertOneSetting(SETTING_BRAND_LOGO, logoKey, actorId),
      this.upsertOneSetting(SETTING_BRAND_THEME_COLOR, themeColor, actorId),
      this.upsertOneSetting(SETTING_BRAND_TITLE, title || DEFAULT_BRANDING.title, actorId),
      this.upsertOneSetting(SETTING_BRAND_SUBTITLE, subtitle || DEFAULT_BRANDING.subtitle, actorId),
    ])
  }

  private async upsertMailSmtp(dto: UpdateMailSmtpDto, actorId?: string | null) {
    const host = String(dto.host || '').trim()
    const email = String(dto.email || '').trim()
    const fromName = String(dto.fromName || '').trim()
    const port = Math.trunc(Number(dto.port))
    if (!host) throw new BadRequestException('請填寫 SMTP 主機')
    if (!email || !email.includes('@')) {
      throw new BadRequestException('請填寫有效的發件郵箱')
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new BadRequestException('SMTP 端口須為 1–65535')
    }

    const existingRows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [...MAIL_SETTING_KEYS] } },
      select: { key: true, value: true },
    })
    const existingMap: Record<string, string> = {}
    for (const r of existingRows) existingMap[r.key] = r.value
    const existingStoredPassword = String(existingMap[SETTING_MAIL_SENDING_EMAIL_PASSWORD] ?? '')

    const incomingPassword = String(dto.password ?? '')
    const keepPassword =
      !incomingPassword || incomingPassword === PASSWORD_MASK || incomingPassword === '••••••••'
    /** 新密码加密入库；保留时若仍是历史明文则顺带加密 */
    const password = keepPassword
      ? encryptSecret(existingStoredPassword)
      : encryptSecret(incomingPassword)

    await Promise.all([
      this.upsertOneSetting(SETTING_MAIL_SENDING_EMAIL_HOST, host, actorId),
      this.upsertOneSetting(SETTING_MAIL_SENDING_EMAIL, email, actorId),
      this.upsertOneSetting(SETTING_MAIL_SENDING_EMAIL_PASSWORD, password, actorId),
      this.upsertOneSetting(SETTING_MAIL_SENDING_EMAIL_PORT, String(port), actorId),
      this.upsertOneSetting(
        SETTING_MAIL_SENDING_EMAIL_SECURE,
        dto.secure === true ? 'true' : 'false',
        actorId,
      ),
      this.upsertOneSetting(
        SETTING_MAIL_SENDING_FROM_NAME,
        fromName || DEFAULT_MAIL_SMTP.fromName,
        actorId,
      ),
    ])

    // 清理旧 JSON 整包键（若仍存在）
    await this.prisma.systemSetting.deleteMany({ where: { key: SETTING_MAIL_SMTP_LEGACY } })
  }

  async updateContractExpiringSoon(
    dto: UpdateContractExpiringSoonDto,
    actorId?: string | null,
  ): Promise<SystemSettingsView> {
    const unit: ExpiringSoonUnit = dto.unit === 'month' ? 'month' : 'day'
    const amountMax = unit === 'month' ? 36 : 365
    const amount = Math.trunc(Number(dto.amount))
    if (!Number.isFinite(amount) || amount < 1 || amount > amountMax) {
      throw new BadRequestException(
        unit === 'month'
          ? 'amount must be an integer between 1 and 36 for month'
          : 'amount must be an integer between 1 and 365 for day',
      )
    }
    const statusMode: ExpiringSoonStatusMode =
      dto.statusMode === 'include' || dto.statusMode === 'exclude' || dto.statusMode === 'all'
        ? dto.statusMode
        : 'all'
    if ((statusMode === 'include' || statusMode === 'exclude') && !(dto.statuses?.length > 0)) {
      throw new BadRequestException('statuses required when statusMode is include or exclude')
    }
    const cfg: ContractExpiringSoonConfig = {
      amount,
      unit,
      statusMode,
      statuses: [...new Set((dto.statuses || []).map((s) => String(s || '').trim()).filter(Boolean))].slice(
        0,
        32,
      ),
    }
    const value = JSON.stringify(cfg)
    await this.prisma.systemSetting.upsert({
      where: { key: SETTING_CONTRACT_EXPIRING_SOON },
      create: {
        key: SETTING_CONTRACT_EXPIRING_SOON,
        value,
        label: '合約即將到期篩選條件',
        remark:
          '合約列表「即將到期」：到期日前多久 + 狀態含/排；僅 SuperAdmin 可改。預設 30 天、含租賃中/退租中。',
        sortOrder: 20,
        createdById: actorId || null,
        updatedById: actorId || null,
      },
      update: {
        value,
        updatedById: actorId || null,
      },
    })
    return this.getView()
  }
}
