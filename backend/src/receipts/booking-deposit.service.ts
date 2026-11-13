import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BookingDepositMovementType,
  NumberingBizKey,
  Prisma,
  ReceiptKind,
  type PrismaClient,
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { NumberingRulesService } from '../numbering-rules/numbering-rules.service'
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit'
import {
  syncReceivableReceivedAmount,
  syncReceivableReceivedAmounts,
} from './receivable-received.sync'
import { CashFlowsService } from '../contract-settlements/cash-flows.service'
import { ReceiptsService } from './receipts.service'

function s(v?: string | null) {
  return (v ?? '').trim()
}

function parseDateOnly(v: string | null | undefined, field: string): Date {
  const raw = s(v)
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`)
  }
  return new Date(`${raw}T00:00:00.000Z`)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function dec(n: number) {
  return new Prisma.Decimal(round2(n))
}

export type BookingDepositReceiptSummaryDto = {
  id: string
  receiptCode: string
  amount: number
  paymentMethod: string
}

export type BookingDepositAccountDto = {
  contractId: string
  /** 当前视角收据 ID：合约汇总时为首张；按收据查询时为该收据 */
  receiptId: string | null
  /** 当前视角收据编号 */
  receiptCode: string
  /** 合约下全部定金收据 */
  receipts: BookingDepositReceiptSummaryDto[]
  /** contract=合约汇总；receipt=单张收据视角（动账仅本收据） */
  scope: 'contract' | 'receipt'
  principal: number
  applied: number
  refunded: number
  /** 没收／扣留合计（取消合约等） */
  forfeited: number
  balance: number
  /** 合约池可用余额（单张收据视角下退还上限用此值） */
  contractBalance: number
  movements: BookingDepositMovementDto[]
}

export type BookingDepositMovementDto = {
  id: string
  type: 'apply' | 'refund' | 'top_up' | 'forfeit'
  amount: number
  movementDate: string
  receivableId: string | null
  invoiceId: string | null
  /** 抵扣关联发票编号（仅 apply） */
  invoiceCode: string
  offsetReceiptId: string | null
  offsetReceiptCode: string
  depositRefundId: string | null
  remark: string
  createdBy: string
  createdAt: string
}

@Injectable()
export class BookingDepositService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingRulesService,
    private readonly receipts: ReceiptsService,
    private readonly cashFlows: CashFlowsService,
  ) {}

  private async nextReceiptCode() {
    return this.numbering.nextCode(NumberingBizKey.receipt, {
      isTaken: async (code) =>
        !!(await this.prisma.receipt.findFirst({
          where: { receiptCode: code },
          select: { id: true },
        })),
    })
  }

  private dateOnly(d: Date | null | undefined): string {
    if (!d) return ''
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  private toMovementDto(
    row: {
      id: string
      type: BookingDepositMovementType
      amount: Prisma.Decimal
      movementDate: Date
      receivableId: string | null
      invoiceId: string | null
      offsetReceiptId: string | null
      depositRefundId: string | null
      remark: string
      createdAt: Date
      offsetReceipt?: { receiptCode: string } | null
      bookingDepositReceipt?: { id: string; receiptCode: string } | null
      createdByUser?: AuditUserRef | null
    },
    invoiceCode = '',
  ): BookingDepositMovementDto & {
    bookingDepositReceiptId?: string
    bookingDepositReceiptCode?: string
  } {
    return {
      id: row.id,
      type: row.type,
      amount: Number(row.amount.toString()),
      movementDate: this.dateOnly(row.movementDate),
      receivableId: row.receivableId,
      invoiceId: row.invoiceId,
      invoiceCode: invoiceCode || '',
      offsetReceiptId: row.offsetReceiptId,
      offsetReceiptCode: row.offsetReceipt?.receiptCode ?? '',
      depositRefundId: row.depositRefundId,
      remark: row.remark,
      createdBy: auditActorLabel(row.createdByUser),
      createdAt: row.createdAt.toISOString(),
      bookingDepositReceiptId: row.bookingDepositReceipt?.id ?? undefined,
      bookingDepositReceiptCode: row.bookingDepositReceipt?.receiptCode ?? undefined,
    }
  }

  /** 批量补齐动账关联发票编号 */
  private async mapMovementsWithInvoiceCodes<
    T extends {
      id: string
      type: BookingDepositMovementType
      amount: Prisma.Decimal
      movementDate: Date
      receivableId: string | null
      invoiceId: string | null
      offsetReceiptId: string | null
      depositRefundId: string | null
      remark: string
      createdAt: Date
      offsetReceipt?: { receiptCode: string } | null
      bookingDepositReceipt?: { id: string; receiptCode: string } | null
      createdByUser?: AuditUserRef | null
    },
  >(rows: T[]) {
    const ids = [
      ...new Set(rows.map((r) => r.invoiceId).filter((x): x is string => !!x)),
    ]
    const codeById = new Map<string, string>()
    if (ids.length) {
      const invoices = await this.prisma.invoice.findMany({
        where: { id: { in: ids } },
        select: { id: true, invoiceCode: true },
      })
      for (const inv of invoices) codeById.set(inv.id, inv.invoiceCode ?? '')
    }
    return rows.map((r) =>
      this.toMovementDto(r, (r.invoiceId && codeById.get(r.invoiceId)) || ''),
    )
  }

  private moneyText(n: number) {
    return round2(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  private async appendDepositChangeLog(
    tx: Prisma.TransactionClient | PrismaClient,
    receiptId: string,
    line: string,
  ) {
    const row = await tx.receipt.findUnique({
      where: { id: receiptId },
      select: { changeLog: true },
    })
    if (!row) return
    const prev = (row.changeLog || '').trim()
    const next = prev ? `${prev}\n${line}` : line
    await tx.receipt.update({
      where: { id: receiptId },
      data: { changeLog: next },
    })
  }

  /** 按合约 / 应收 / 发票列出定金抵扣动账（供详情 / 关联收据展示） */
  async listApplies(params: {
    contractId?: string
    receivableId?: string
    invoiceId?: string
  }) {
    const contractId = s(params.contractId)
    const receivableId = s(params.receivableId)
    const invoiceId = s(params.invoiceId)
    if (!contractId && !receivableId && !invoiceId) {
      throw new BadRequestException('contractId, receivableId or invoiceId is required')
    }
    const rows = await this.prisma.bookingDepositMovement.findMany({
      where: {
        type: BookingDepositMovementType.apply,
        ...(contractId ? { contractId } : {}),
        ...(receivableId ? { receivableId } : {}),
        ...(invoiceId ? { invoiceId } : {}),
      },
      include: {
        bookingDepositReceipt: { select: { id: true, receiptCode: true } },
        offsetReceipt: { select: { receiptCode: true } },
        ...auditUserInclude,
      },
      orderBy: [{ movementDate: 'asc' }, { createdAt: 'asc' }],
    })
    return this.mapMovementsWithInvoiceCodes(rows)
  }

  /** 按合约下全部定金收据汇总可用余额 */
  async getAccountByContractId(contractId: string): Promise<BookingDepositAccountDto> {
    const id = s(contractId)
    if (!id) throw new BadRequestException('contractId is required')

    const contract = await this.prisma.contract.findUnique({
      where: { id },
      select: {
        id: true,
        customerId: true,
        bookingDeposit: true,
        paymentDate: true,
        paymentMethod: true,
        paymentVoucher: true,
        bookingDepositReceiptId: true,
      },
    })
    if (!contract) throw new NotFoundException(`Contract ${id} not found`)

    const contractPrincipal = round2(
      contract.bookingDeposit == null ? 0 : Number(contract.bookingDeposit.toString()),
    )

    let receipts = await this.listBookingDepositReceipts(id)

    // 历史数据：收据已存在但合约未回写 FK 时补齐第一张指针
    if (receipts.length && !contract.bookingDepositReceiptId) {
      await this.prisma.contract
        .update({
          where: { id },
          data: { bookingDepositReceiptId: receipts[0]!.id },
        })
        .catch(() => undefined)
    }

    // 有已收订金却无定金收据时补建（与开单 ensure 一致），详情才能展示编号与账户
    if (!receipts.length && contractPrincipal > 0 && contract.customerId) {
      await this.receipts.ensureBookingDepositReceipt({
        id: contract.id,
        customerId: contract.customerId,
        bookingDeposit: contract.bookingDeposit,
        paymentDate: contract.paymentDate,
        paymentMethod: contract.paymentMethod || '',
        paymentVoucher: contract.paymentVoucher || '',
        bookingDepositReceiptId: contract.bookingDepositReceiptId,
      })
      receipts = await this.listBookingDepositReceipts(id)
    }

    // 指针优先：第一张以合约 FK 为准，其余按创建时间
    if (contract.bookingDepositReceiptId && receipts.length > 1) {
      const primaryId = contract.bookingDepositReceiptId
      receipts = [
        ...receipts.filter((r) => r.id === primaryId),
        ...receipts.filter((r) => r.id !== primaryId),
      ]
    }

    return this.buildAccountFromReceipts(id, receipts, contractPrincipal)
  }

  async getAccountByReceiptId(receiptId: string): Promise<BookingDepositAccountDto> {
    const id = s(receiptId)
    if (!id) throw new BadRequestException('receiptId is required')
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      select: {
        id: true,
        receiptCode: true,
        amount: true,
        paymentMethod: true,
        kind: true,
        contractId: true,
      },
    })
    if (!receipt) throw new NotFoundException(`Receipt ${id} not found`)
    if (receipt.kind !== ReceiptKind.booking_deposit) {
      throw new BadRequestException('仅定金收据可查询定金账户')
    }
    if (!receipt.contractId) {
      throw new BadRequestException('定金收据未关联合约')
    }
    // 单张收据视角：动账／本金仅本收据；另附合约池余额供退还上限
    const contractAccount = await this.getAccountByContractId(receipt.contractId)
    const self = await this.buildAccountFromReceipts(
      receipt.contractId,
      [
        {
          id: receipt.id,
          receiptCode: receipt.receiptCode,
          amount: round2(Number(receipt.amount.toString())),
          paymentMethod: s(receipt.paymentMethod),
        },
      ],
      round2(Number(receipt.amount.toString())),
      'receipt',
    )
    return {
      ...self,
      receipts: contractAccount.receipts,
      contractBalance: contractAccount.balance,
    }
  }

  private async listBookingDepositReceipts(contractId: string) {
    const rows = await this.prisma.receipt.findMany({
      where: { contractId, kind: ReceiptKind.booking_deposit },
      select: {
        id: true,
        receiptCode: true,
        amount: true,
        paymentMethod: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    return rows.map((r) => ({
      id: r.id,
      receiptCode: r.receiptCode,
      amount: round2(Number(r.amount.toString())),
      paymentMethod: s(r.paymentMethod),
    }))
  }

  private async buildAccountFromReceipts(
    contractId: string,
    receipts: BookingDepositReceiptSummaryDto[],
    fallbackPrincipal = 0,
    scope: 'contract' | 'receipt' = 'contract',
  ): Promise<BookingDepositAccountDto> {
    if (!receipts.length) {
      const bal = round2(fallbackPrincipal)
      return {
        contractId,
        receiptId: null,
        receiptCode: '',
        receipts: [],
        scope,
        principal: bal,
        applied: 0,
        refunded: 0,
        forfeited: 0,
        balance: bal,
        contractBalance: bal,
        movements: [],
      }
    }

    const receiptIds = receipts.map((r) => r.id)
    const principal = round2(receipts.reduce((sum, r) => sum + r.amount, 0))
    const rows = await this.prisma.bookingDepositMovement.findMany({
      where: { bookingDepositReceiptId: { in: receiptIds } },
      include: {
        bookingDepositReceipt: { select: { id: true, receiptCode: true } },
        offsetReceipt: { select: { receiptCode: true } },
        ...auditUserInclude,
      },
      orderBy: [{ movementDate: 'asc' }, { createdAt: 'asc' }],
    })
    let applied = 0
    let refunded = 0
    let forfeited = 0
    for (const r of rows) {
      const amt = Number(r.amount.toString())
      if (r.type === BookingDepositMovementType.apply) applied += amt
      else if (r.type === BookingDepositMovementType.refund) refunded += amt
      else if (r.type === BookingDepositMovementType.forfeit) forfeited += amt
      // top_up 仅流水展示，本金已计入各收据 amount
    }
    applied = round2(applied)
    refunded = round2(refunded)
    forfeited = round2(forfeited)
    const balance = round2(Math.max(0, principal - applied - refunded - forfeited))
    const primary = receipts[0]!
    return {
      contractId,
      receiptId: primary.id,
      receiptCode: primary.receiptCode,
      receipts,
      scope,
      principal,
      applied,
      refunded,
      forfeited,
      balance,
      contractBalance: balance,
      movements: await this.mapMovementsWithInvoiceCodes(rows),
    }
  }

  /**
   * 收款：用户自选应收 + 定金抵扣额；剩余用现金等支付方式开收据。
   * 定金按所选应收顺序 FIFO 分摊。
   */
  async collectWithDeposit(input: {
    contractId: string
    receivableIds: string[]
    bookingDepositApply: number
    /** 本次现金收款；undefined=收齐抵扣后剩余；0=仅定金抵扣 */
    cashAmount?: number
    paymentDate: string
    paymentMethod?: string
    remark?: string
  }, actorId?: string | null) {
    const contractId = s(input.contractId)
    if (!contractId) throw new BadRequestException('contractId is required')
    const ids = [...new Set((input.receivableIds ?? []).map((x) => s(x)).filter(Boolean))]
    if (!ids.length) throw new BadRequestException('请选择应收')

    const applyTotal = round2(Number(input.bookingDepositApply ?? 0))
    if (!Number.isFinite(applyTotal) || applyTotal < 0) {
      throw new BadRequestException('定金抵扣金额无效')
    }

    const paymentDate = parseDateOnly(input.paymentDate, 'paymentDate')
    const remark = s(input.remark)
    const cashMethod = s(input.paymentMethod)

    const account = await this.getAccountByContractId(contractId)
    if (applyTotal > 0.009) {
      if (!account.receiptId) {
        throw new BadRequestException('该合约尚无定金收据，无法抵扣')
      }
      if (applyTotal > account.balance + 0.009) {
        throw new BadRequestException(
          `定金抵扣不可超过可用余额（可用 ${account.balance.toFixed(2)}）`,
        )
      }
    }

    const receivables = await this.prisma.receivable.findMany({
      where: { id: { in: ids }, contractId },
      select: {
        id: true,
        receivableCode: true,
        customerId: true,
        contractId: true,
        invoiceId: true,
        receivableAmount: true,
        invoice: { select: { invoiceCode: true } },
      },
    })
    if (receivables.length !== ids.length) {
      throw new BadRequestException('部分应收不存在或不属于该合约')
    }
    const byId = new Map(receivables.map((r) => [r.id, r]))
    const ordered = ids.map((id) => byId.get(id)!)

    const outstandingTotal = round2(
      ordered.reduce((sum, r) => {
        const due = round2(Math.max(0, Number(r.receivableAmount.toString())))
        return sum + due
      }, 0),
    )
    if (outstandingTotal <= 0) throw new BadRequestException('所选应收无需收款')
    if (applyTotal > outstandingTotal + 0.009) {
      throw new BadRequestException('定金抵扣不可超过所选应收未收合计')
    }

    const maxCash = round2(Math.max(0, outstandingTotal - applyTotal))
    let cashTotal: number
    if (input.cashAmount === undefined || input.cashAmount === null) {
      cashTotal = maxCash
    } else {
      cashTotal = round2(Number(input.cashAmount))
      if (!Number.isFinite(cashTotal) || cashTotal < 0) {
        throw new BadRequestException('本次收款金额无效')
      }
      if (cashTotal > maxCash + 0.009) {
        throw new BadRequestException(
          `本次收款金额不可超过抵扣后未收（最多 ${maxCash.toFixed(2)}）`,
        )
      }
    }
    if (applyTotal <= 0.009 && cashTotal <= 0.009) {
      throw new BadRequestException('请填写定金抵扣或本次收款金额')
    }
    if (cashTotal > 0.009 && !cashMethod) {
      throw new BadRequestException('请选择收款方式')
    }

    type Plan = {
      receivableId: string
      receivableCode: string
      invoiceCode: string
      customerId: string
      contractId: string | null
      invoiceId: string | null
      depositPart: number
      cashPart: number
    }
    const plans: Plan[] = []
    let depositLeft = applyTotal
    let cashLeft = cashTotal
    for (const r of ordered) {
      const due = round2(Math.max(0, Number(r.receivableAmount.toString())))
      if (due <= 0) continue
      const depositPart = round2(Math.min(due, depositLeft))
      depositLeft = round2(depositLeft - depositPart)
      const remainAfterDeposit = round2(due - depositPart)
      const cashPart = round2(Math.min(remainAfterDeposit, cashLeft))
      cashLeft = round2(cashLeft - cashPart)
      if (depositPart <= 0 && cashPart <= 0) continue
      plans.push({
        receivableId: r.id,
        receivableCode: r.receivableCode,
        invoiceCode: r.invoice?.invoiceCode ?? '',
        customerId: r.customerId,
        contractId: r.contractId,
        invoiceId: r.invoiceId,
        depositPart,
        cashPart,
      })
    }
    if (!plans.length) throw new BadRequestException('所选应收无需收款')

    const createdReceiptIds: string[] = []
    const movementIds: string[] = []
    const paymentDateStr = this.dateOnly(paymentDate)

    await this.prisma.$transaction(async (tx) => {
      let liveBalance = account.balance
      if (applyTotal > 0.009 && account.receiptId) {
        // 事务内再锁余额（简化：重算）
        const moved = await tx.bookingDepositMovement.aggregate({
          where: { bookingDepositReceiptId: account.receiptId },
          _sum: { amount: true },
        })
        const principalRow = await tx.receipt.findUnique({
          where: { id: account.receiptId },
          select: { amount: true },
        })
        const principal = Number(principalRow?.amount.toString() ?? 0)
        const used = Number(moved._sum.amount?.toString() ?? 0)
        liveBalance = round2(Math.max(0, principal - used))
        if (applyTotal > liveBalance + 0.009) {
          throw new BadRequestException(
            `定金余额已变化（可用 ${liveBalance.toFixed(2)}），请刷新后重试`,
          )
        }
      }

      for (const plan of plans) {
        if (plan.depositPart > 0) {
          if (!account.receiptId) {
            throw new BadRequestException('该合约尚无定金收据，无法抵扣')
          }
          // 只写动账，不再另开「定金抵扣」发票收据
          const mov = await tx.bookingDepositMovement.create({
            data: {
              bookingDepositReceiptId: account.receiptId,
              contractId,
              type: BookingDepositMovementType.apply,
              amount: dec(plan.depositPart),
              movementDate: paymentDate,
              receivableId: plan.receivableId,
              invoiceId: plan.invoiceId,
              remark: remark || '定金抵扣',
              createdById: actorId || null,
              updatedById: actorId || null,
            },
            select: { id: true },
          })
          movementIds.push(mov.id)
          liveBalance = round2(liveBalance - plan.depositPart)
          // 结构化行，前端按语言渲染：#bd|apply|date|amount|invoiceCode
          await this.appendDepositChangeLog(
            tx,
            account.receiptId,
            `#bd|apply|${paymentDateStr}|${round2(plan.depositPart).toFixed(2)}|${plan.invoiceCode || ''}`,
          )
        }
      }

      // 同一客户／合约：现金部分合并开一张收据 + 分摊明细
      const cashPlans = plans.filter((p) => p.cashPart > 0.009)
      if (cashPlans.length) {
        const cashTotalNow = round2(cashPlans.reduce((s, p) => s + p.cashPart, 0))
        const single = cashPlans.length === 1 ? cashPlans[0]! : null
        const code = await this.nextReceiptCode()
        const cash = await tx.receipt.create({
          data: {
            receiptCode: code,
            kind: ReceiptKind.invoice,
            customerId: cashPlans[0]!.customerId,
            contractId,
            invoiceId: single?.invoiceId ?? null,
            receivableId: single?.receivableId ?? null,
            paymentDate,
            paymentMethod: cashMethod,
            amount: dec(cashTotalNow),
            remark: remark || undefined,
            createdById: actorId || null,
            updatedById: actorId || null,
          },
          select: { id: true },
        })
        createdReceiptIds.push(cash.id)
        for (let i = 0; i < cashPlans.length; i++) {
          const p = cashPlans[i]!
          await tx.receiptAllocation.create({
            data: {
              receiptId: cash.id,
              receivableId: p.receivableId,
              invoiceId: p.invoiceId,
              amount: dec(p.cashPart),
              sortOrder: i,
              remark: '',
              createdById: actorId || null,
              updatedById: actorId || null,
            },
          })
        }
      }

      await syncReceivableReceivedAmounts(
        tx,
        plans.map((p) => p.receivableId),
      )
    })

    if (createdReceiptIds.length) {
      const cashReceipts = await this.prisma.receipt.findMany({
        where: { id: { in: createdReceiptIds } },
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          paymentMethod: true,
          contractId: true,
          customerId: true,
        },
      })
      for (const row of cashReceipts) {
        await this.cashFlows.recordReceiptIn({
          receiptId: row.id,
          amount: Number(row.amount.toString()),
          flowDate: row.paymentDate || paymentDate,
          paymentMethod: row.paymentMethod || cashMethod,
          contractId: row.contractId,
          customerId: row.customerId,
          remark: '应收收款入账',
          actorId,
        })
      }
    }

    const after = await this.getAccountByContractId(contractId)
    return {
      ok: true,
      receiptIds: createdReceiptIds,
      movementIds,
      account: after,
    }
  }

  /**
   * 签约中加收定金：
   * - new_receipt（默认）：新开一张定金收据；
   * - merge：累加到指定已有定金收据（省略 mergeReceiptId 则首张；操作人自行判断尚未交给租客）。
   */
  async topUp(
    input: {
      contractId: string
      amount: number
      paymentDate: string
      mode?: 'new_receipt' | 'merge'
      mergeReceiptId?: string
      paymentMethod?: string
      remark?: string
      paymentVoucher?: string
    },
    actorId?: string | null,
  ) {
    const contractId = s(input.contractId)
    if (!contractId) throw new BadRequestException('contractId is required')
    const amount = round2(Number(input.amount ?? 0))
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('加收金额须大于 0')
    }
    const mode = input.mode === 'merge' ? 'merge' : 'new_receipt'
    const mergeReceiptId = s(input.mergeReceiptId)
    const paymentDate = parseDateOnly(input.paymentDate, 'paymentDate')
    const paymentMethod = s(input.paymentMethod)
    const remark = s(input.remark)
    const voucherKey = s(input.paymentVoucher)

    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        customerId: true,
        status: true,
        bookingDeposit: true,
        paymentDate: true,
        paymentMethod: true,
        paymentVoucher: true,
        bookingDepositReceiptId: true,
      },
    })
    if (!contract) throw new NotFoundException(`Contract ${contractId} not found`)
    if (!this.isSigningStatus(contract.status)) {
      throw new BadRequestException('僅「簽約中」的合約可加收定金')
    }
    if (!contract.customerId) {
      throw new BadRequestException('合約缺少客戶，無法加收定金')
    }

    // 解析已有定金收据指针；无收据时允许首次「加收」直接新开，勿先造 0 元收据
    let primaryReceiptId = contract.bookingDepositReceiptId || ''
    if (!primaryReceiptId) {
      const existing = await this.prisma.receipt.findFirst({
        where: { contractId, kind: ReceiptKind.booking_deposit },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      if (existing) {
        primaryReceiptId = existing.id
        await this.prisma.contract.update({
          where: { id: contractId },
          data: { bookingDepositReceiptId: existing.id },
        })
      }
    }

    if (mode === 'merge' && !primaryReceiptId && !mergeReceiptId) {
      throw new BadRequestException('尚無定金收據可合併，請改選「新開定金收據」')
    }
    if (mode === 'new_receipt' && !paymentMethod) {
      throw new BadRequestException('請選擇收款方式')
    }

    const mov = await this.prisma.$transaction(async (tx) => {
      const prevContractPrincipal = round2(
        contract.bookingDeposit == null ? 0 : Number(contract.bookingDeposit.toString()),
      )
      const nextContractPrincipal = round2(prevContractPrincipal + amount)

      let movementReceiptId = primaryReceiptId
      let pinPrimaryReceiptId = ''

      if (mode === 'merge') {
        const targetId = mergeReceiptId || primaryReceiptId
        const receipt = await tx.receipt.findFirst({
          where: {
            id: targetId,
            contractId,
            kind: ReceiptKind.booking_deposit,
          },
          select: { id: true, receiptCode: true, amount: true, paymentMethod: true },
        })
        if (!receipt) {
          throw new BadRequestException('合併目標定金收據不存在或不屬於本合約')
        }

        const existingMethod = s(receipt.paymentMethod)
        // 单张收据只能有一种收款方式：与目标收据不同则禁止合并，须新开收据
        if (paymentMethod && existingMethod && paymentMethod !== existingMethod) {
          throw new BadRequestException(
            `合併時收款方式須與目標定金收據一致（${receipt.receiptCode} 現為「${existingMethod}」）；若方式不同請改選「新開定金收據」`,
          )
        }

        const prev = round2(Number(receipt.amount.toString()))
        const nextReceiptAmount = round2(prev + amount)
        const methodToWrite = existingMethod || paymentMethod || undefined
        movementReceiptId = receipt.id

        await tx.receipt.update({
          where: { id: receipt.id },
          data: {
            amount: dec(nextReceiptAmount),
            paymentDate,
            ...(methodToWrite && !existingMethod ? { paymentMethod: methodToWrite } : {}),
            updatedById: actorId || null,
          },
        })
      } else {
        const receiptCode = await this.nextReceiptCode()
        const createdReceipt = await tx.receipt.create({
          data: {
            receiptCode,
            kind: ReceiptKind.booking_deposit,
            customerId: contract.customerId!,
            contractId,
            paymentDate,
            paymentMethod: paymentMethod || '',
            amount: dec(amount),
            remark: remark || (primaryReceiptId ? '加收定金' : '定金收據'),
            createdById: actorId || null,
            updatedById: actorId || null,
          },
          select: { id: true },
        })
        movementReceiptId = createdReceipt.id
        // 首次收取：钉合约定金收据指针
        if (!primaryReceiptId) pinPrimaryReceiptId = createdReceipt.id
      }

      const contractMethodPatch =
        mode === 'merge'
          ? // 合并：不覆盖已有方式；仅在合约侧为空时补写
            !s(contract.paymentMethod) && paymentMethod
              ? { paymentMethod }
              : {}
          : paymentMethod
            ? { paymentMethod }
            : {}

      await tx.contract.update({
        where: { id: contractId },
        data: {
          bookingDeposit: dec(nextContractPrincipal),
          paymentDate,
          ...contractMethodPatch,
          ...(voucherKey ? { paymentVoucher: voucherKey } : {}),
          ...(pinPrimaryReceiptId
            ? { bookingDepositReceiptId: pinPrimaryReceiptId }
            : {}),
          updatedById: actorId || null,
        },
      })

      if (voucherKey) {
        const maxSort = await tx.receiptAttachment.aggregate({
          where: { receiptId: movementReceiptId },
          _max: { sortOrder: true },
        })
        const sortOrder = (maxSort._max.sortOrder ?? -1) + 1
        await tx.receiptAttachment.create({
          data: {
            receiptId: movementReceiptId,
            fileName: this.fileNameFromStorageKey(voucherKey),
            storageKey: voucherKey,
            sortOrder,
            createdById: actorId || null,
            updatedById: actorId || null,
          },
        })
      }

      const created = await tx.bookingDepositMovement.create({
        data: {
          bookingDepositReceiptId: movementReceiptId,
          contractId,
          type: BookingDepositMovementType.top_up as BookingDepositMovementType,
          amount: dec(amount),
          movementDate: paymentDate,
          remark: remark || (mode === 'merge' ? '加收定金（合并）' : '加收定金'),
          createdById: actorId || null,
          updatedById: actorId || null,
        },
        include: {
          bookingDepositReceipt: { select: { id: true, receiptCode: true } },
          offsetReceipt: { select: { receiptCode: true } },
          ...auditUserInclude,
        },
      })

      await this.appendDepositChangeLog(
        tx,
        movementReceiptId,
        `#bd|top_up|${this.dateOnly(paymentDate)}|${round2(amount).toFixed(2)}`,
      )
      return created
    })

    const topped = await this.prisma.receipt.findUnique({
      where: { id: mov.bookingDepositReceiptId },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        contractId: true,
        customerId: true,
      },
    })
    if (topped) {
      await this.cashFlows.syncReceiptInAmount({
        receiptId: topped.id,
        amount: Number(topped.amount.toString()),
        flowDate: topped.paymentDate || paymentDate,
        paymentMethod: topped.paymentMethod || paymentMethod,
        contractId: topped.contractId,
        customerId: topped.customerId,
        remark: mode === 'merge' ? '定金加收（合并）入账' : '定金加收入账',
        actorId,
      })
    }

    return {
      movement: this.toMovementDto(mov),
      account: await this.getAccountByContractId(contractId),
    }
  }

  private isSigningStatus(status?: string | null) {
    const raw = s(status)
    if (!raw) return false
    const map: Record<string, string> = {
      草稿: '簽約中',
      draft: '簽約中',
      已簽約: '簽約中',
      已签约: '簽約中',
      signed: '簽約中',
      交吉中: '簽約中',
      簽約中: '簽約中',
      签约中: '簽約中',
      signing: '簽約中',
    }
    return (map[raw] || raw) === '簽約中'
  }

  private fileNameFromStorageKey(storageKey: string) {
    const base = storageKey.split(/[/\\]/).pop() || storageKey
    return (
      base.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '') ||
      base ||
      'voucher'
    )
  }

  /** 退还定金余额（挂账余款或退租一并退） */
  async refund(input: {
    contractId: string
    amount: number
    refundDate: string
    remark?: string
    depositRefundId?: string | null
  }, actorId?: string | null) {
    const contractId = s(input.contractId)
    if (!contractId) throw new BadRequestException('contractId is required')
    const amount = round2(Number(input.amount ?? 0))
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('退还金额须大于 0')
    }
    const refundDate = parseDateOnly(input.refundDate, 'refundDate')
    const remark = s(input.remark)
    const depositRefundId = s(input.depositRefundId) || null

    const account = await this.getAccountByContractId(contractId)
    if (!account.receiptId) throw new BadRequestException('该合约尚无定金收据')
    if (amount > account.balance + 0.009) {
      throw new BadRequestException(
        `退还不可超过可用余额（可用 ${account.balance.toFixed(2)}）`,
      )
    }

    const mov = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bookingDepositMovement.create({
        data: {
          bookingDepositReceiptId: account.receiptId!,
          contractId,
          type: BookingDepositMovementType.refund,
          amount: dec(amount),
          movementDate: refundDate,
          depositRefundId,
          remark: remark || (depositRefundId ? '退租一并退还定金' : '定金退还'),
          createdById: actorId || null,
          updatedById: actorId || null,
        },
        include: {
          bookingDepositReceipt: { select: { id: true, receiptCode: true } },
          offsetReceipt: { select: { receiptCode: true } },
          ...auditUserInclude,
        },
      })
      await this.appendDepositChangeLog(
        tx,
        account.receiptId!,
        `#bd|refund|${this.dateOnly(refundDate)}|${round2(amount).toFixed(2)}`,
      )
      return created
    })

    return {
      movement: this.toMovementDto(mov),
      account: await this.getAccountByContractId(contractId),
    }
  }

  /** 没收／扣留定金余额（取消合约等；不退现金） */
  async forfeit(input: {
    contractId: string
    amount: number
    forfeitDate: string
    remark?: string
  }, actorId?: string | null) {
    const contractId = s(input.contractId)
    if (!contractId) throw new BadRequestException('contractId is required')
    const amount = round2(Number(input.amount ?? 0))
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('扣留金额须大于 0')
    }
    const forfeitDate = parseDateOnly(input.forfeitDate, 'forfeitDate')
    const remark = s(input.remark)

    const account = await this.getAccountByContractId(contractId)
    if (!account.receiptId) throw new BadRequestException('该合约尚无定金收据')
    if (amount > account.balance + 0.009) {
      throw new BadRequestException(
        `扣留不可超过可用余额（可用 ${account.balance.toFixed(2)}）`,
      )
    }

    const mov = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bookingDepositMovement.create({
        data: {
          bookingDepositReceiptId: account.receiptId!,
          contractId,
          type: BookingDepositMovementType.forfeit,
          amount: dec(amount),
          movementDate: forfeitDate,
          remark: remark || '取消合约扣留定金',
          createdById: actorId || null,
          updatedById: actorId || null,
        },
        include: {
          bookingDepositReceipt: { select: { id: true, receiptCode: true } },
          offsetReceipt: { select: { receiptCode: true } },
          ...auditUserInclude,
        },
      })
      await this.appendDepositChangeLog(
        tx,
        account.receiptId!,
        `#bd|forfeit|${this.dateOnly(forfeitDate)}|${round2(amount).toFixed(2)}`,
      )
      return created
    })

    return {
      movement: this.toMovementDto(mov),
      account: await this.getAccountByContractId(contractId),
    }
  }

  /**
   * 退租超额赔偿：用定金余额抵扣（不挂应收；开票金额已是抵扣后净额）
   * 仅写 apply 动账，降低可用余额，便于少退定金。
   */
  async consumeForVacateExcessOffset(
    input: {
      contractId: string
      amount: number
      movementDate: Date
      remark?: string
      invoiceId?: string | null
    },
    actorId?: string | null,
    db: Prisma.TransactionClient | PrismaClient = this.prisma,
  ) {
    const contractId = s(input.contractId)
    const amount = round2(Math.max(0, Number(input.amount) || 0))
    if (!contractId || amount <= 0.009) return null

    const account = await this.getAccountByContractId(contractId)
    if (!account.receiptId) {
      throw new BadRequestException('该合约尚无定金收据，无法用定金抵扣超出按金金额赔偿')
    }
    if (amount > account.balance + 0.009) {
      throw new BadRequestException(
        `定金抵扣超额不可超过可用余额（可用 ${account.balance.toFixed(2)}）`,
      )
    }

    const dateLabel = this.dateOnly(input.movementDate)
    const mov = await db.bookingDepositMovement.create({
      data: {
        bookingDepositReceiptId: account.receiptId,
        contractId,
        type: BookingDepositMovementType.apply,
        amount: dec(amount),
        movementDate: input.movementDate,
        receivableId: null,
        invoiceId: s(input.invoiceId) || null,
        remark: s(input.remark) || '退租超出按金金额赔偿定金抵扣',
        createdById: actorId || null,
        updatedById: actorId || null,
      },
      select: { id: true },
    })
    await this.appendDepositChangeLog(
      db,
      account.receiptId,
      `#bd|apply_vacate_excess|${dateLabel}|${amount.toFixed(2)}|${s(input.invoiceId) || ''}`,
    )
    return mov.id
  }

  /**
   * 按金退还保存后同步定金退还动账：
   * - 目标金额为 0：删除本退还单已挂的 refund 动账
   * - 目标金额 > 0：校验余额后 upsert 一笔 refund
   */
  async syncDepositRefundBookingAmount(
    depositRefundId: string,
    contractId: string,
    targetAmount: number,
    refundDate: string | null | undefined,
    actorId?: string | null,
  ) {
    const amt = round2(Math.max(0, Number(targetAmount ?? 0)))
    const existing = await this.prisma.bookingDepositMovement.findMany({
      where: {
        depositRefundId,
        type: BookingDepositMovementType.refund,
      },
      select: { id: true, amount: true },
    })

    if (amt <= 0) {
      if (existing.length) {
        await this.prisma.bookingDepositMovement.deleteMany({
          where: { id: { in: existing.map((e) => e.id) } },
        })
      }
      return
    }

    const account = await this.getAccountByContractId(contractId)
    if (!account.receiptId) {
      throw new BadRequestException('该合约尚无定金收据，无法一并退还定金')
    }
    const alreadyOnThis = round2(
      existing.reduce((s, e) => s + Number(e.amount.toString()), 0),
    )
    const available = round2(account.balance + alreadyOnThis)
    if (amt > available + 0.009) {
      throw new BadRequestException(
        `一并退还定金不可超过可用余额（可用 ${available.toFixed(2)}）`,
      )
    }

    const dateStr =
      s(refundDate) ||
      new Date().toISOString().slice(0, 10)
    const movementDate = parseDateOnly(dateStr, 'refundDate')

    const dateLabel = this.dateOnly(movementDate)
    const balAfter = round2(available - amt)

    if (existing.length === 1) {
      await this.prisma.bookingDepositMovement.update({
        where: { id: existing[0]!.id },
        data: {
          amount: dec(amt),
          movementDate,
          updatedById: actorId || null,
          remark: '退租一并退还定金',
        },
      })
      await this.appendDepositChangeLog(
        this.prisma,
        account.receiptId,
        `#bd|refund_term|${dateLabel}|${round2(amt).toFixed(2)}`,
      )
      return
    }
    if (existing.length > 1) {
      await this.prisma.bookingDepositMovement.deleteMany({
        where: { id: { in: existing.map((e) => e.id) } },
      })
    }
    await this.prisma.bookingDepositMovement.create({
      data: {
        bookingDepositReceiptId: account.receiptId,
        contractId,
        type: BookingDepositMovementType.refund,
        amount: dec(amt),
        movementDate,
        depositRefundId,
        remark: '退租一并退还定金',
        createdById: actorId || null,
        updatedById: actorId || null,
      },
    })
    await this.appendDepositChangeLog(
      this.prisma,
      account.receiptId,
      `#bd|refund_term|${dateLabel}|${round2(amt).toFixed(2)}`,
    )
  }

}
