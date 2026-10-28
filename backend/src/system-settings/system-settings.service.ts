import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { auditActorLabel, auditUserSelect } from '../common/audit'
import {
  DEFAULT_CONTRACT_EXPIRING_SOON,
  DEFAULT_RENT_INVOICE_LEAD_DAYS,
  SETTING_CONTRACT_EXPIRING_SOON,
  SETTING_RENT_INVOICE_LEAD_DAYS,
  type ContractExpiringSoonConfig,
  type ExpiringSoonStatusMode,
  type ExpiringSoonUnit,
} from './system-settings.constants'
import {
  UpdateContractExpiringSoonDto,
  UpdateSystemSettingsDto,
} from './dto/system-setting.dto'

export type SystemSettingsView = {
  rentInvoiceLeadDays: number
  contractExpiringSoon: ContractExpiringSoonConfig
  updatedAt: string | null
  updatedBy: string | null
}

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

  /** 业务侧读取：租金开票提前天数 */
  async getRentInvoiceLeadDays(): Promise<number> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTING_RENT_INVOICE_LEAD_DAYS },
      select: { value: true },
    })
    return this.parseLeadDays(row?.value)
  }

  /** 业务侧读取：合约「即将到期」筛选条件 */
  async getContractExpiringSoon(): Promise<ContractExpiringSoonConfig> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTING_CONTRACT_EXPIRING_SOON },
      select: { value: true },
    })
    return this.parseExpiringSoon(row?.value)
  }

  async getView(): Promise<SystemSettingsView> {
    const [leadRow, expiringRow] = await Promise.all([
      this.prisma.systemSetting.findUnique({
        where: { key: SETTING_RENT_INVOICE_LEAD_DAYS },
        include: { updatedByUser: { select: auditUserSelect } },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: SETTING_CONTRACT_EXPIRING_SOON },
        include: { updatedByUser: { select: auditUserSelect } },
      }),
    ])
    const newer =
      !leadRow?.updatedAt
        ? expiringRow
        : !expiringRow?.updatedAt
          ? leadRow
          : leadRow.updatedAt >= expiringRow.updatedAt
            ? leadRow
            : expiringRow
    return {
      rentInvoiceLeadDays: this.parseLeadDays(leadRow?.value),
      contractExpiringSoon: this.parseExpiringSoon(expiringRow?.value),
      updatedAt: newer?.updatedAt ? newer.updatedAt.toISOString() : null,
      updatedBy: auditActorLabel(newer?.updatedByUser) || null,
    }
  }

  async update(dto: UpdateSystemSettingsDto, actorId?: string | null): Promise<SystemSettingsView> {
    const days = Math.trunc(Number(dto.rentInvoiceLeadDays))
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      throw new BadRequestException('rentInvoiceLeadDays must be an integer between 1 and 90')
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

    return this.getView()
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
