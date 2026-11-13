import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { NumberingBizKey, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { NumberingRulesService } from '../numbering-rules/numbering-rules.service'
import { SystemSettingsService } from '../system-settings/system-settings.service'
import { invoiceRoomSuffix } from '../common/room-lease'
import {
  chargingPeriodDetailDescription,
  formatDateYmd,
  isWithinLeadWindow,
  listBillingPeriods,
  parsePaymentCycleMonths,
  rentBillingStartDate,
} from '../common/billing-period'

export const INVOICE_TYPE_DEPOSIT = 'Deposit'
export const INVOICE_TYPE_CHARGING_PERIOD = '1, Charging Period'
export const BILLING_KIND_MANUAL = 'manual'
export const BILLING_KIND_AUTO = 'auto'

type DbClient = Prisma.TransactionClient | PrismaService

type DetailLine = {
  description: string
  quantity: number
  unitAmount: number
  remark?: string
}

function s(v?: string | null) {
  return (v ?? '').trim()
}

function dec(n: number) {
  return new Prisma.Decimal(Number.isFinite(n) ? n : 0)
}

function num(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(v.toString())
  return Number.isFinite(n) ? n : 0
}

function utcToday(): Date {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function linesAmount(lines: DetailLine[]) {
  return round2(lines.reduce((sum, l) => sum + round2(l.quantity * l.unitAmount), 0))
}

function linesSignature(lines: DetailLine[]) {
  return lines
    .map(
      (l) =>
        `${s(l.description)}|${round2(l.quantity)}|${round2(l.unitAmount)}|${s(l.remark)}`,
    )
    .join(';')
}

/** 香港时间戳（变更记录） */
function hkStamp(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(now)
}

@Injectable()
export class InvoiceAutoService {
  private readonly logger = new Logger(InvoiceAutoService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingRules: NumberingRulesService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  /**
   * 幂等生成「房间按金发票」+「首个缴费周期租金发票」，并各自生成应收帐。
   * 合约创建/保存时即调用；开单（签约中→租赁中）再次调用亦安全。
   */
  async ensureInitialInvoicesOnIssue(
    contractId: string,
    actorId?: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<{ depositInvoiceId: string | null; rentInvoiceId: string | null }> {
    const db = tx ?? this.prisma
    const depositInvoiceId = await this.ensureDepositInvoice(contractId, actorId, db)
    const rentInvoiceId = await this.ensureFirstRentInvoice(contractId, actorId, db)
    return { depositInvoiceId, rentInvoiceId }
  }

  /**
   * 合约保存后：按当前合约重算未收款的自动「按金」与「首期租金」发票明细／金额／应收，并写变更记录。
   * 若对应发票已有收款／分摊，而金额或明细将变化 → 抛错阻断，避免账实不符。
   */
  async syncAutoInvoicesFromContract(
    contractId: string,
    actorId?: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<{ depositSynced: boolean; rentSynced: boolean }> {
    const db = tx ?? this.prisma
    const depositSynced = await this.syncDepositInvoiceFromContract(contractId, actorId, db)
    const rentSynced = await this.syncFirstRentInvoiceFromContract(contractId, actorId, db)
    return { depositSynced, rentSynced }
  }

  /**
   * 日任务：仅「租賃中」合约，距缴费周期开始 ≤ leadDays 且尚未开票时自动开租金发票。
   * 「簽約中」不会开第 2 期及以后（须先上传签约文件开单）。
   */
  async runDueRentInvoices(today = utcToday()): Promise<{ created: number; blockedSigning: number }> {
    const leadDays = await this.systemSettings.getRentInvoiceLeadDays()

    // 仍为签约中、已进入第 2 期提前窗：只记日志，不开票（前端列表另有提示）
    const signingContracts = await this.prisma.contract.findMany({
      where: {
        status: { in: ['簽約中', '已簽約', '草稿', '交吉中'] },
        startDate: { not: null },
        endDate: { not: null },
      },
      select: {
        id: true,
        contractCode: true,
        startDate: true,
        endDate: true,
        paymentCycle: true,
        periods: {
          select: { dateType: true, startDate: true, endDate: true, sortOrder: true },
          orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }],
        },
      },
    })
    let blockedSigning = 0
    for (const c of signingContracts) {
      const months = parsePaymentCycleMonths(c.paymentCycle)
      const billingStart = rentBillingStartDate(c.startDate, c.periods)
      const periods = listBillingPeriods(billingStart, c.endDate, months)
      const second = periods[1]
      if (!second) continue
      const windowOpen = new Date(
        second.start.getTime() - leadDays * 24 * 60 * 60 * 1000,
      )
      if (today.getTime() < windowOpen.getTime()) continue
      blockedSigning += 1
      this.logger.warn(
        `Skip auto rent invoice (still signing): ${c.contractCode || c.id}, 2nd period starts ${formatDateYmd(second.start)}`,
      )
    }

    const contracts = await this.prisma.contract.findMany({
      where: {
        status: '租賃中',
        startDate: { not: null },
        endDate: { not: null },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        paymentCycle: true,
        monthlyRent: true,
        periods: {
          select: { dateType: true, startDate: true, endDate: true, sortOrder: true },
          orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }],
        },
      },
    })

    let created = 0
    for (const c of contracts) {
      const months = parsePaymentCycleMonths(c.paymentCycle)
      const billingStart = rentBillingStartDate(c.startDate, c.periods)
      const periods = listBillingPeriods(billingStart, c.endDate, months)
      for (const p of periods) {
        if (!isWithinLeadWindow(p.start, today, leadDays)) continue
        // 首期通常已在创建时生成；此处补开后续期及漏开的首期
        const before = await this.prisma.invoice.findFirst({
          where: {
            contractId: c.id,
            billingKind: BILLING_KIND_AUTO,
            invoiceType: INVOICE_TYPE_CHARGING_PERIOD,
            periodStart: p.start,
            status: { not: '已取消' },
          },
          select: { id: true },
        })
        if (before) continue
        const id = await this.ensureRentInvoiceForPeriod(c.id, p.start, p.end, null)
        if (id) created += 1
      }
    }
    this.logger.log(
      `Due rent invoices created: ${created}; blocked (still signing, 2nd+ due): ${blockedSigning}`,
    )
    return { created, blockedSigning }
  }

  async ensureDepositInvoice(
    contractId: string,
    actorId?: string | null,
    db: DbClient = this.prisma,
  ): Promise<string | null> {
    const existing = await db.invoice.findFirst({
      where: {
        contractId,
        billingKind: BILLING_KIND_AUTO,
        invoiceType: INVOICE_TYPE_DEPOSIT,
        status: { not: '已取消' },
      },
      select: { id: true },
    })
    if (existing) {
      await this.ensureReceivableForInvoice(existing.id, actorId, db)
      return existing.id
    }

    const contract = await this.loadContractForBilling(contractId, db)
    if (!contract) return null

    const lines = this.buildDepositLines(contract)
    const amount = linesAmount(lines)
    const today = utcToday()
    const invoiceId = await this.createInvoiceWithDetails(
      {
        contract,
        invoiceType: INVOICE_TYPE_DEPOSIT,
        billingKind: BILLING_KIND_AUTO,
        description: INVOICE_TYPE_DEPOSIT,
        amount,
        invoiceDate: today,
        paymentDueDate: today,
        periodStart: null,
        periodEnd: null,
        lines,
      },
      actorId,
      db,
    )
    return invoiceId
  }

  /** 按当前合约重算未收款的自动按金发票 */
  private async syncDepositInvoiceFromContract(
    contractId: string,
    actorId: string | null | undefined,
    db: DbClient,
  ): Promise<boolean> {
    const invoice = await db.invoice.findFirst({
      where: {
        contractId,
        billingKind: BILLING_KIND_AUTO,
        invoiceType: INVOICE_TYPE_DEPOSIT,
        status: { not: '已取消' },
      },
      include: {
        serviceDetails: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })
    if (!invoice) return false

    const contract = await this.loadContractForBilling(contractId, db)
    if (!contract) return false

    const lines = this.buildDepositLines(contract)
    const nextAmount = linesAmount(lines)
    const prevAmount = num(invoice.amount)
    const prevLines: DetailLine[] = (invoice.serviceDetails || []).map((d) => ({
      description: d.description,
      quantity: num(d.quantity),
      unitAmount: num(d.unitAmount),
      remark: s(d.remark) || undefined,
    }))
    if (
      round2(prevAmount) === nextAmount &&
      linesSignature(prevLines) === linesSignature(lines)
    ) {
      return false
    }

    if (await this.invoiceHasCollections(invoice.id, db)) {
      throw new BadRequestException(
        `按金發票 ${invoice.invoiceCode || ''} 已有收款，無法隨合約自動改額（原 ${prevAmount.toFixed(2)} → ${nextAmount.toFixed(2)}）。請先處理收款或手工調整發票。`,
      )
    }

    await this.replaceInvoiceDetailsAndAmount({
      invoiceId: invoice.id,
      invoiceCode: invoice.invoiceCode,
      prevAmount,
      nextAmount,
      lines,
      description: INVOICE_TYPE_DEPOSIT,
      periodStart: null,
      periodEnd: null,
      paymentDueDate: undefined,
      changeKind: 'deposit',
      actorId,
      db,
    })
    return true
  }

  async ensureFirstRentInvoice(
    contractId: string,
    actorId?: string | null,
    db: DbClient = this.prisma,
  ): Promise<string | null> {
    const contract = await this.loadContractForBilling(contractId, db)
    if (!contract?.startDate || !contract.endDate) return null
    const months = parsePaymentCycleMonths(contract.paymentCycle)
    // 有前缀免租期时，首张缴费期发票从免租结束后次日起算
    const billingStart = rentBillingStartDate(contract.startDate, contract.periods || [])
    const periods = listBillingPeriods(billingStart, contract.endDate, months)
    const first = periods[0]
    if (!first) return null
    return this.ensureRentInvoiceForPeriod(contractId, first.start, first.end, actorId, db)
  }

  async ensureRentInvoiceForPeriod(
    contractId: string,
    periodStart: Date,
    periodEnd: Date,
    actorId?: string | null,
    db: DbClient = this.prisma,
  ): Promise<string | null> {
    const existing = await db.invoice.findFirst({
      where: {
        contractId,
        billingKind: BILLING_KIND_AUTO,
        invoiceType: INVOICE_TYPE_CHARGING_PERIOD,
        periodStart,
        status: { not: '已取消' },
      },
      select: { id: true },
    })
    if (existing) {
      await this.ensureReceivableForInvoice(existing.id, actorId, db)
      return existing.id
    }

    const contract = await this.loadContractForBilling(contractId, db)
    if (!contract) return null

    const months = parsePaymentCycleMonths(contract.paymentCycle)
    const monthly = num(contract.monthlyRent)
    // 整周期按「月租 × 缴费月数」；尾期不足整周期仍按整周期计费（与旧系统常见做法一致）
    const amount = round2(monthly * months)
    const detailDesc = chargingPeriodDetailDescription(periodStart, periodEnd)
    const today = utcToday()

    return this.createInvoiceWithDetails(
      {
        contract,
        invoiceType: INVOICE_TYPE_CHARGING_PERIOD,
        billingKind: BILLING_KIND_AUTO,
        description: detailDesc,
        amount,
        invoiceDate: today,
        paymentDueDate: periodStart,
        periodStart,
        periodEnd,
        lines: [
          {
            description: detailDesc,
            quantity: months,
            unitAmount: monthly,
          },
        ],
      },
      actorId,
      db,
    )
  }

  /** 按当前合约重算未收款的首期自动租金发票（签约中通常仅此一张） */
  private async syncFirstRentInvoiceFromContract(
    contractId: string,
    actorId: string | null | undefined,
    db: DbClient,
  ): Promise<boolean> {
    const contract = await this.loadContractForBilling(contractId, db)
    if (!contract?.startDate || !contract.endDate) return false

    const months = parsePaymentCycleMonths(contract.paymentCycle)
    const billingStart = rentBillingStartDate(contract.startDate, contract.periods || [])
    const periods = listBillingPeriods(billingStart, contract.endDate, months)
    const first = periods[0]
    if (!first) return false

    const monthly = num(contract.monthlyRent)
    const nextAmount = round2(monthly * months)
    const detailDesc = chargingPeriodDetailDescription(first.start, first.end)
    const lines: DetailLine[] = [
      {
        description: detailDesc,
        quantity: months,
        unitAmount: monthly,
      },
    ]

    let invoice = await db.invoice.findFirst({
      where: {
        contractId,
        billingKind: BILLING_KIND_AUTO,
        invoiceType: INVOICE_TYPE_CHARGING_PERIOD,
        periodStart: first.start,
        status: { not: '已取消' },
      },
      include: {
        serviceDetails: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })
    // 首期起算日因免租／合约期变更而移动时：取最早一张未取消自动租金票对齐
    if (!invoice) {
      invoice = await db.invoice.findFirst({
        where: {
          contractId,
          billingKind: BILLING_KIND_AUTO,
          invoiceType: INVOICE_TYPE_CHARGING_PERIOD,
          status: { not: '已取消' },
        },
        orderBy: [{ periodStart: 'asc' }, { createdAt: 'asc' }],
        include: {
          serviceDetails: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      })
    }
    if (!invoice) return false

    const prevAmount = num(invoice.amount)
    const prevLines: DetailLine[] = (invoice.serviceDetails || []).map((d) => ({
      description: d.description,
      quantity: num(d.quantity),
      unitAmount: num(d.unitAmount),
      remark: s(d.remark) || undefined,
    }))
    const prevStart = invoice.periodStart ? formatDateYmd(invoice.periodStart) : ''
    const nextStart = formatDateYmd(first.start)
    const prevEnd = invoice.periodEnd ? formatDateYmd(invoice.periodEnd) : ''
    const nextEnd = formatDateYmd(first.end)
    const same =
      round2(prevAmount) === nextAmount &&
      linesSignature(prevLines) === linesSignature(lines) &&
      prevStart === nextStart &&
      prevEnd === nextEnd
    if (same) return false

    if (await this.invoiceHasCollections(invoice.id, db)) {
      throw new BadRequestException(
        `首期租金發票 ${invoice.invoiceCode || ''} 已有收款，無法隨合約自動改額（原 ${prevAmount.toFixed(2)} → ${nextAmount.toFixed(2)}）。請先處理收款或手工調整發票。`,
      )
    }

    await this.replaceInvoiceDetailsAndAmount({
      invoiceId: invoice.id,
      invoiceCode: invoice.invoiceCode,
      prevAmount,
      nextAmount,
      lines,
      description: detailDesc,
      periodStart: first.start,
      periodEnd: first.end,
      paymentDueDate: first.start,
      changeKind: 'first_rent',
      actorId,
      db,
    })
    return true
  }

  private buildDepositLines(
    contract: NonNullable<Awaited<ReturnType<InvoiceAutoService['loadContractForBilling']>>>,
  ): DetailLine[] {
    const lines: DetailLine[] = []
    const roomDeposit = num(contract.roomDeposit)
    lines.push({
      description: '房間按金',
      quantity: 1,
      unitAmount: roomDeposit,
    })

    const misc = num(contract.miscDeposit)
    if (misc > 0) {
      lines.push({ description: '雜項按金', quantity: 1, unitAmount: misc })
    }

    // 房門匙 + 智能卡信箱匙合并为一条（旧系统：房門匙 或 信箱匙）
    const doorQty = Math.max(0, Math.floor(contract.doorKeyQty || 0))
    const mailQty = Math.max(0, Math.floor(contract.mailboxKeyQty || 0))
    const keyQty = doorQty + mailQty
    const keyAmt = num(contract.doorKeyDeposit) + num(contract.mailboxKeyDeposit)
    if (keyQty > 0 || keyAmt > 0) {
      const unit = keyQty > 0 ? keyAmt / keyQty : keyAmt
      lines.push({
        description: '房門匙 或 信箱匙',
        quantity: keyQty > 0 ? keyQty : 1,
        unitAmount: round2(unit),
      })
    }

    for (const fee of contract.loanItems) {
      const qty = num(fee.quantity)
      const unit = num(fee.unitAmount)
      const sub = num(fee.subtotal) || round2(qty * unit)
      if (!s(fee.description) && sub <= 0) continue
      lines.push({
        description: s(fee.description) || '借出用品',
        quantity: qty || 1,
        unitAmount: qty > 0 ? unit : sub,
        remark: s(fee.remark) || undefined,
      })
    }
    return lines
  }

  private async invoiceHasCollections(invoiceId: string, db: DbClient): Promise<boolean> {
    const receivables = await db.receivable.findMany({
      where: { invoiceId },
      select: { receivedAmount: true },
    })
    if (receivables.some((r) => num(r.receivedAmount) > 0.009)) return true

    const allocCount = await db.receiptAllocation.count({ where: { invoiceId } })
    if (allocCount > 0) return true

    const receiptCount = await db.receipt.count({ where: { invoiceId } })
    return receiptCount > 0
  }

  private async appendInvoiceChangeLog(
    db: DbClient,
    invoiceId: string,
    line: string,
  ) {
    const row = await db.invoice.findUnique({
      where: { id: invoiceId },
      select: { changeLog: true },
    })
    if (!row) return
    const prev = (row.changeLog || '').trim()
    const next = prev ? `${prev}\n${line}` : line
    await db.invoice.update({
      where: { id: invoiceId },
      data: { changeLog: next },
    })
  }

  private async replaceInvoiceDetailsAndAmount(input: {
    invoiceId: string
    invoiceCode: string | null
    prevAmount: number
    nextAmount: number
    lines: DetailLine[]
    description: string
    periodStart: Date | null
    periodEnd: Date | null
    paymentDueDate?: Date
    /** deposit | first_rent — 存结构化行，前端按语言渲染 */
    changeKind: 'deposit' | 'first_rent'
    actorId?: string | null
    db: DbClient
  }) {
    const { db, invoiceId, actorId } = input
    const actor = actorId || null

    await db.invoiceServiceDetail.deleteMany({ where: { invoiceId } })
    if (input.lines.length) {
      await db.invoiceServiceDetail.createMany({
        data: input.lines.map((l, i) => {
          const quantity = dec(l.quantity)
          const unitAmount = dec(l.unitAmount)
          const subtotal = dec(round2(l.quantity * l.unitAmount))
          return {
            invoiceId,
            description: l.description,
            quantity,
            unitAmount,
            subtotal,
            remark: s(l.remark),
            sortOrder: i,
            createdById: actor,
            updatedById: actor,
          }
        }),
      })
    }

    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        amount: dec(input.nextAmount),
        description: input.description,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        ...(input.paymentDueDate ? { paymentDueDate: input.paymentDueDate } : {}),
        updatedById: actor,
      },
    })

    const receivables = await db.receivable.findMany({
      where: { invoiceId },
      select: { id: true, receivedAmount: true },
    })
    for (const r of receivables) {
      const received = num(r.receivedAmount)
      const receivableAmount = round2(Math.max(0, input.nextAmount - received))
      await db.receivable.update({
        where: { id: r.id },
        data: {
          invoiceAmount: dec(input.nextAmount),
          receivableAmount: dec(receivableAmount),
          updatedById: actor,
        },
      })
    }
    // 尚无应收时补建
    if (!receivables.length) {
      await this.ensureReceivableForInvoice(invoiceId, actorId, db)
    }

    const code = s(input.invoiceCode) || invoiceId
    // #inv|contract_sync|deposit|stamp|prev|next|invoiceCode
    await this.appendInvoiceChangeLog(
      db,
      invoiceId,
      `#inv|contract_sync|${input.changeKind}|${hkStamp()}|${round2(input.prevAmount).toFixed(2)}|${round2(input.nextAmount).toFixed(2)}|${code}`,
    )
  }

  private async loadContractForBilling(contractId: string, db: DbClient) {
    return db.contract.findUnique({
      where: { id: contractId },
      include: {
        room: { select: { roomCode: true, leaseCapability: true, name: true } },
        periods: {
          select: { dateType: true, startDate: true, endDate: true, sortOrder: true },
          orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }],
        },
        loanItems: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })
  }

  private async nextInvoiceCode(
    room: {
      roomCode: string
      leaseCapability: string
    },
    occupancyMode: string,
    partLabel: string,
    db: DbClient,
  ): Promise<string> {
    const suffix = invoiceRoomSuffix({
      roomCode: room.roomCode,
      leaseCapability: room.leaseCapability,
      occupancyMode,
      partLabel,
    })
    const auto = await this.numberingRules.nextCode(NumberingBizKey.invoice, {
      isTaken: async (code) => {
        const full = suffix ? `${code}-${suffix}` : code
        return !!(await db.invoice.findFirst({
          where: { invoiceCode: full },
          select: { id: true },
        }))
      },
    })
    return suffix ? `${auto}-${suffix}` : auto
  }

  /** 与 ReceivablesService 一致：AR{YYMMDD}{####}（应收暂未接入编号规则表） */
  private async nextReceivableCode(db: DbClient): Promise<string> {
    const now = new Date()
    const y = String(now.getUTCFullYear()).slice(-2)
    const m = String(now.getUTCMonth() + 1).padStart(2, '0')
    const d = String(now.getUTCDate()).padStart(2, '0')
    const prefix = `AR${y}${m}${d}`
    const latest = await db.receivable.findFirst({
      where: { receivableCode: { startsWith: prefix } },
      orderBy: { receivableCode: 'desc' },
      select: { receivableCode: true },
    })
    let seq = 1
    if (latest?.receivableCode) {
      const n = Number(latest.receivableCode.slice(prefix.length))
      if (!Number.isNaN(n)) seq = n + 1
    }
    return `${prefix}${String(seq).padStart(4, '0')}`
  }

  private async createInvoiceWithDetails(
    input: {
      contract: NonNullable<Awaited<ReturnType<InvoiceAutoService['loadContractForBilling']>>>
      invoiceType: string
      billingKind: string
      description: string
      amount: number
      invoiceDate: Date
      paymentDueDate: Date
      periodStart: Date | null
      periodEnd: Date | null
      lines: DetailLine[]
    },
    actorId: string | null | undefined,
    db: DbClient,
  ): Promise<string> {
    const { contract } = input
    const invoiceCode = await this.nextInvoiceCode(
      {
        roomCode: contract.room?.roomCode || '',
        leaseCapability: contract.room?.leaseCapability || 'flexible',
      },
      contract.occupancyMode || 'whole',
      contract.partLabel || '',
      db,
    )
    const actor = actorId || null
    const created = await db.invoice.create({
      data: {
        invoiceCode,
        contractId: contract.id,
        customerId: contract.customerId,
        roomId: contract.roomId,
        invoiceType: input.invoiceType,
        billingKind: input.billingKind,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        description: input.description,
        amount: dec(input.amount),
        status: '已開票',
        invoiceDate: input.invoiceDate,
        paymentDueDate: input.paymentDueDate,
        salesManagerId: contract.salesManagerId,
        roomNameText: s(contract.roomNameText) || contract.room?.name || '',
        createdById: actor,
        updatedById: actor,
        serviceDetails: {
          create: input.lines.map((l, i) => {
            const quantity = dec(l.quantity)
            const unitAmount = dec(l.unitAmount)
            const subtotal = dec(Math.round(l.quantity * l.unitAmount * 100) / 100)
            return {
              description: l.description,
              quantity,
              unitAmount,
              subtotal,
              remark: s(l.remark),
              sortOrder: i,
              createdById: actor,
              updatedById: actor,
            }
          }),
        },
      },
      select: { id: true },
    })
    await this.ensureReceivableForInvoice(created.id, actorId, db)
    return created.id
  }

  /**
   * 退租超额赔偿：开「Others」杂项发票并建应收（扣除超过已收按金的部分）。
   */
  async createVacateExcessCompensationInvoice(
    params: {
      contractId: string
      amount: number
      invoiceDate: Date
      paymentDueDate?: Date | null
      lines?: DetailLine[]
      description?: string
      remark?: string
    },
    actorId?: string | null,
    db: DbClient = this.prisma,
  ): Promise<{
    invoiceId: string
    receivableId: string | null
    invoiceCode: string
  }> {
    const amount = round2(Math.max(0, Number(params.amount) || 0))
    if (amount <= 0.009) {
      throw new BadRequestException('超出按金金额赔偿须大于 0')
    }
    const contract = await this.loadContractForBilling(params.contractId, db)
    if (!contract) {
      throw new BadRequestException(`Contract ${params.contractId} not found`)
    }
    const description = s(params.description) || '退租超出按金金额赔偿'
    const lines =
      params.lines?.length && params.lines.some((l) => round2(l.quantity * l.unitAmount) > 0.009)
        ? params.lines.filter((l) => round2(l.quantity * l.unitAmount) > 0.009)
        : [{ description, quantity: 1, unitAmount: amount }]
    const invoiceId = await this.createInvoiceWithDetails(
      {
        contract,
        invoiceType: 'Others',
        billingKind: BILLING_KIND_MANUAL,
        description,
        amount,
        invoiceDate: params.invoiceDate,
        paymentDueDate: params.paymentDueDate || params.invoiceDate,
        periodStart: null,
        periodEnd: null,
        lines,
      },
      actorId,
      db,
    )
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      select: { invoiceCode: true },
    })
    const receivable = await db.receivable.findFirst({
      where: { invoiceId },
      select: { id: true },
    })
    const remark =
      params.remark !== undefined
        ? s(params.remark)
        : `退租超出按金金额赔偿 ${invoice?.invoiceCode || ''}`.trim()
    if (receivable) {
      await db.receivable.update({
        where: { id: receivable.id },
        data: { remark, updatedById: actorId || null },
      })
    }
    return {
      invoiceId,
      receivableId: receivable?.id ?? null,
      invoiceCode: invoice?.invoiceCode || '',
    }
  }

  /**
   * 开票即建应收（幂等）：已有下属应收则直接返回。
   * @param opts.remark 备注；省略时写「自動開票 …」（定时/签约自动开票）；手动开票可传空串。
   */
  async ensureReceivableForInvoice(
    invoiceId: string,
    actorId?: string | null,
    db: DbClient = this.prisma,
    opts?: { remark?: string },
  ): Promise<string | null> {
    const existing = await db.receivable.findFirst({
      where: { invoiceId },
      select: { id: true },
    })
    if (existing) return existing.id

    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        contractId: true,
        customerId: true,
        amount: true,
        invoiceDate: true,
        paymentDueDate: true,
        invoiceCode: true,
      },
    })
    if (!invoice) return null

    const receivableCode = await this.nextReceivableCode(db)
    const amount = invoice.amount ?? dec(0)
    const actor = actorId || null
    const remark =
      opts?.remark !== undefined
        ? s(opts.remark)
        : invoice.invoiceCode
          ? `自動開票 ${invoice.invoiceCode}`
          : `自動開票 ${formatDateYmd(utcToday())}`
    const row = await db.receivable.create({
      data: {
        receivableCode,
        invoiceId: invoice.id,
        contractId: invoice.contractId,
        customerId: invoice.customerId,
        invoiceDate: invoice.invoiceDate,
        paymentDueDate: invoice.paymentDueDate,
        invoiceAmount: amount,
        receivedAmount: dec(0),
        receivableAmount: amount,
        remark,
        createdById: actor,
        updatedById: actor,
      },
      select: { id: true },
    })
    await db.invoice.update({
      where: { id: invoice.id },
      data: { relatedReceivableRef: receivableCode },
    })
    return row.id
  }
}
