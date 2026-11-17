import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import * as nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { PrismaService } from '../prisma/prisma.service'
import { decryptSecret } from '../common/secret-box'
import {
  MAIL_SETTING_KEYS,
  mailSmtpFromValueMap,
  type MailSmtpConfig,
} from '../system-settings/system-settings.constants'
import {
  normalizeMailLocale,
  passwordResetMailContent,
  type MailLocale,
} from './mail.i18n'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getMailSmtp(): Promise<MailSmtpConfig> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [...MAIL_SETTING_KEYS] } },
      select: { key: true, value: true },
    })
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value
    const cfg = mailSmtpFromValueMap(map)
    try {
      return { ...cfg, password: decryptSecret(cfg.password) }
    } catch (e) {
      this.logger.error(
        `decrypt mail password failed: ${e instanceof Error ? e.message : String(e)}`,
      )
      return { ...cfg, password: '' }
    }
  }

  private async createTransport(cfg: MailSmtpConfig): Promise<Transporter> {
    if (!cfg.host || !cfg.email) {
      throw new BadRequestException('郵件 SMTP 未配置完整（主機／發件郵箱），請在系統設置中維護')
    }
    if (!cfg.password) {
      throw new BadRequestException('郵件 SMTP 密碼未配置，請在系統設置中填寫後再發送')
    }
    return nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: {
        user: cfg.email,
        pass: cfg.password,
      },
    })
  }

  async sendMail(params: {
    to: string
    subject: string
    text: string
    html?: string
  }): Promise<void> {
    const cfg = await this.getMailSmtp()
    const transport = await this.createTransport(cfg)
    const from = cfg.fromName
      ? `"${cfg.fromName.replace(/"/g, '')}" <${cfg.email}>`
      : cfg.email
    try {
      await transport.sendMail({
        from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html || params.text.replace(/\n/g, '<br/>'),
      })
    } catch (e) {
      this.logger.error(`sendMail failed: ${e instanceof Error ? e.message : String(e)}`)
      throw new BadRequestException('郵件發送失敗，請稍後再試或聯繫管理員檢查 SMTP 設置')
    }
  }

  async sendPasswordResetCode(
    to: string,
    code: string,
    accountLabel: string,
    localeRaw?: string | null,
  ): Promise<void> {
    const locale: MailLocale = normalizeMailLocale(localeRaw)
    const { subject, text } = passwordResetMailContent(locale, { code, accountLabel })
    await this.sendMail({ to, subject, text })
  }
}
