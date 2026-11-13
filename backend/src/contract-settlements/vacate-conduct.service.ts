import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  ContractSettlementItemType,
  ContractSettlementType,
  Prisma,
  RoomLeaseCapability,
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { INVOICE_TYPE_DEPOSIT } from '../invoices/invoice-auto.service'
import { InvoiceAutoService } from '../invoices/invoice-auto.service'
import { BookingDepositService } from '../receipts/booking-deposit.service'
import { allocateRoomDepositRefundToReceivables } from '../receipts/receivable-received.sync'
import { CustomerRequirementsService } from '../customer-requirements/customer-requirements.service'
import {
  aggregateRoomStatus,
  buildRoomOccupancy,
  OCCUPYING_CONTRACT_STATUSES,
} from '../common/room-lease'
import {
  formatDateYmd,
  listBillingPeriods,
  parsePaymentCycleMonths,
  rentBillingStartDate,
} from '../common/billing-period'
import {
  ConductVacateSettlementDto,
} from './dto/vacate-conduct.dto'
import { ContractSettlementsService } from './contract-settlements.service'
import {
  settlementInclude,
  toContractSettlementDto,
} from './contract-settlement.mapper'
import { dateOnlyStr, round2 } from './settlement-code.util'
import { BOOKING_OFFSET_EXCESS_REMARK } from './settlement-item.constants'

const TERMINABLE_STATUSES = new Set(['租賃中', '退租中', '已續約'])

/**
 * 退租类型默认规则：
 * 踏入最后一期缴费周期首日（系统可自动开出末期租金发票之日）起算到期退租；
 * 此前为提前退租。无切片时回退为与合约到期日比较。
 */
function resolveTerminationKind(
  termDateYmd: string,
  endDateYmd: string | null | undefined,
  lastPeriodStartYmd: string | null | undefined,
): 'expiry' | 'early' {
  if (lastPeriodStartYmd) {
    return termDateYmd < lastPeriodStartYmd ? 'early' : 'expiry'
  }
  return endDateYmd && termDateYmd < endDateYmd ? 'early' : 'expiry'
}

/** 按金发票类型（兼容大小写／历史文案） */
function isDepositInvoiceType(v?: string | null) {
  const t = s(v).toLowerCase()
  if (!t) return false
  if (t === 'deposit') return true
  if (t === '按金' || t.includes('按金')) return true
  return t.includes('deposit')
}

function s(v?: string | null) {
  return (v ?? '').trim()
}

function parseDateOnly(v: string | null | undefined, field: string): Date | null {
  const raw = s(v)
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`)
  }
  return new Date(`${raw}T00:00:00.000Z`)
}

function nonNegInt(v: unknown, field: string): number {
  const n = Math.floor(Number(v ?? 0) || 0)
  if (n < 0) throw new BadRequestException(`${field} must be >= 0`)
  return n
}

@Injectable()
export class VacateConductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingDeposit: BookingDepositService,
    private readonly customerRequirements: CustomerRequirementsService,
    private readonly settlements: ContractSettlementsService,
    private readonly invoiceAuto: InvoiceAutoService,
  ) {}

  /** 退租办理预览：借出物品、按金/定金、未结应收 */
  async previewConduct(contractId: string) {
    const id = s(contractId)
    if (!id) throw new BadRequestException('contractId is required')
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      select: {
        id: true,
        contractCode: true,
        status: true,
        customerId: true,
        roomId: true,
        startDate: true,
        endDate: true,
        paymentCycle: true,
        roomDeposit: true,
        miscDeposit: true,
        doorKeyDeposit: true,
        mailboxKeyDeposit: true,
        doorKeyQty: true,
        mailboxKeyQty: true,
        bookingDeposit: true,
        customer: { select: { id: true, customerCode: true, name: true } },
        room: { select: { id: true, roomCode: true, name: true } },
        periods: {
          select: {
            dateType: true,
            startDate: true,
            endDate: true,
            sortOrder: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }],
        },
      },
    })
    if (!contract) throw new NotFoundException(`Contract ${id} not found`)

    const loanItems = await this.prisma.contractLoanItem.findMany({
      where: { contractId: id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    const receivables = await this.prisma.receivable.findMany({
      where: { contractId: id },
      select: {
        id: true,
        receivableCode: true,
        receivableAmount: true,
        receivedAmount: true,
        invoice: {
          select: {
            id: true,
            invoiceCode: true,
            invoiceType: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    /** 按金票（未取消）：已交／未交；未交将在退租时作废，不阻断「未结应收」 */
    let depositPaid = 0
    let depositUnpaid = 0
    const unpaidDepositReceivables: Array<{
      id: string
      receivableCode: string
      invoiceId: string
      invoiceCode: string
      openAmount: number
      receivedAmount: number
    }> = []
    for (const r of receivables) {
      if (!isDepositInvoiceType(r.invoice?.invoiceType)) continue
      if (s(r.invoice?.status) === '已取消') continue
      const open = round2(Number(r.receivableAmount?.toString() ?? 0))
      const got = round2(Number(r.receivedAmount?.toString() ?? 0))
      depositPaid = round2(depositPaid + got)
      if (open > 0.009) {
        depositUnpaid = round2(depositUnpaid + open)
        unpaidDepositReceivables.push({
          id: r.id,
          receivableCode: r.receivableCode,
          invoiceId: r.invoice?.id || '',
          invoiceCode: r.invoice?.invoiceCode ?? '',
          openAmount: open,
          receivedAmount: got,
        })
      }
    }

    // 应收侧未命中时，回退查按金发票金额／已收（避免类型文案差异导致全 0）
    if (depositPaid <= 0.009 && depositUnpaid <= 0.009) {
      const depositInvoices = await this.prisma.invoice.findMany({
        where: {
          contractId: id,
          status: { not: '已取消' },
          OR: [
            { invoiceType: INVOICE_TYPE_DEPOSIT },
            { invoiceType: { equals: 'deposit', mode: 'insensitive' } },
            { invoiceType: { contains: '按金' } },
            { description: { equals: INVOICE_TYPE_DEPOSIT, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          invoiceCode: true,
          amount: true,
          receivables: {
            select: {
              id: true,
              receivableCode: true,
              receivableAmount: true,
              receivedAmount: true,
            },
          },
        },
      })
      for (const inv of depositInvoices) {
        if (!inv.receivables.length) {
          const amt = round2(Number(inv.amount?.toString() ?? 0))
          if (amt > 0.009) {
            depositUnpaid = round2(depositUnpaid + amt)
          }
          continue
        }
        for (const r of inv.receivables) {
          const open = round2(Number(r.receivableAmount?.toString() ?? 0))
          const got = round2(Number(r.receivedAmount?.toString() ?? 0))
          depositPaid = round2(depositPaid + got)
          if (open > 0.009) {
            depositUnpaid = round2(depositUnpaid + open)
            if (!unpaidDepositReceivables.some((x) => x.id === r.id)) {
              unpaidDepositReceivables.push({
                id: r.id,
                receivableCode: r.receivableCode,
                invoiceId: inv.id,
                invoiceCode: inv.invoiceCode ?? '',
                openAmount: open,
                receivedAmount: got,
              })
            }
          }
        }
      }
    }

    const unsettled = receivables
      .map((r) => {
        const open = round2(Number(r.receivableAmount?.toString() ?? 0))
        const got = round2(Number(r.receivedAmount?.toString() ?? 0))
        const isDeposit =
          isDepositInvoiceType(r.invoice?.invoiceType) &&
          s(r.invoice?.status) !== '已取消'
        return {
          id: r.id,
          receivableCode: r.receivableCode,
          invoiceCode: r.invoice?.invoiceCode ?? '',
          invoiceType: r.invoice?.invoiceType ?? '',
          receivableAmount: open,
          receivedAmount: got,
          openAmount: open,
          isDeposit,
        }
      })
      .filter((r) => r.openAmount > 0.009 && !r.isDeposit)

    const totalDeposit = round2(
      Number(contract.roomDeposit?.toString() ?? 0) +
        Number(contract.miscDeposit?.toString() ?? 0) +
        Number(contract.doorKeyDeposit?.toString() ?? 0) +
        Number(contract.mailboxKeyDeposit?.toString() ?? 0) +
        loanItems.reduce((sum, f) => sum + Number(f.subtotal?.toString() ?? 0), 0),
    )

    const booking = await this.bookingDeposit.getAccountByContractId(id)
    const endDate = dateOnlyStr(contract.endDate)
    const today = dateOnlyStr(new Date())
    const months = parsePaymentCycleMonths(contract.paymentCycle)
    const billingStart = rentBillingStartDate(contract.startDate, contract.periods || [])
    const periods = listBillingPeriods(billingStart, contract.endDate, months)
    const lastPeriod = periods.length ? periods[periods.length - 1] : null
    const lastBillingPeriodStart = lastPeriod ? formatDateYmd(lastPeriod.start) : null

    const existing = await this.prisma.contractSettlement.findFirst({
      where: { contractId: id, type: ContractSettlementType.VACATE },
      select: { id: true, settlementCode: true },
      orderBy: { createdAt: 'desc' },
    })

    return {
      contract: {
        id: contract.id,
        contractCode: contract.contractCode,
        status: contract.status,
        customerId: contract.customerId,
        customerCode: contract.customer?.customerCode ?? '',
        customerName: contract.customer?.name ?? '',
        roomId: contract.roomId,
        roomCode: contract.room?.roomCode ?? '',
        roomName: contract.room?.name ?? '',
        startDate: dateOnlyStr(contract.startDate),
        endDate,
        doorKeyQty: contract.doorKeyQty ?? 0,
        mailboxKeyQty: contract.mailboxKeyQty ?? 0,
        doorKeyDeposit: round2(Number(contract.doorKeyDeposit?.toString() ?? 0)),
        mailboxKeyDeposit: round2(Number(contract.mailboxKeyDeposit?.toString() ?? 0)),
        terminable: TERMINABLE_STATUSES.has(contract.status),
      },
      loanItems: loanItems.map((f) => ({
        id: f.id,
        description: f.description,
        quantity: Number(f.quantity.toString()),
        unitAmount: Number(f.unitAmount.toString()),
        subtotal: Number(f.subtotal.toString()),
        remark: f.remark,
      })),
      totalDeposit,
      /** 按金发票已收合计（实退上限基数） */
      depositPaid,
      /** 按金发票未收合计（退租时作废） */
      depositUnpaid,
      unpaidDepositReceivables,
      suggestedDepositRefund: round2(Math.max(0, depositPaid)),
      bookingDeposit: {
        receiptId: booking.receiptId,
        receiptCode: booking.receiptCode,
        principal: booking.principal,
        applied: booking.applied,
        refunded: booking.refunded,
        balance: booking.balance,
      },
      unsettledReceivables: unsettled,
      unsettledTotal: round2(unsettled.reduce((sum, r) => sum + r.openAmount, 0)),
      lastBillingPeriodStart,
      suggestedKind: resolveTerminationKind(today, endDate, lastBillingPeriodStart),
      existingSettlement: existing,
    }
  }

  /** 一键退租：验收借出 → 扣按金 → VACATE 结算 → 可选按金/定金退还 → 合约已退租 */
  async conduct(dto: ConductVacateSettlementDto, actor = '') {
    const contractId = s(dto.contractId)
    if (!contractId) throw new BadRequestException('contractId is required')
    const terminationDate = parseDateOnly(dto.terminationDate, 'terminationDate')
    if (!terminationDate) throw new BadRequestException('terminationDate is required')
    const actorId = actor || null

    const preview = await this.previewConduct(contractId)
    if (!preview.contract.terminable) {
      throw new BadRequestException(
        `当前合约状态「${preview.contract.status}」不可办理退租（需租賃中／退租中／已續約）`,
      )
    }
    if (preview.existingSettlement) {
      throw new BadRequestException(
        `该合约已有退租结算 ${preview.existingSettlement.settlementCode}，请勿重复办理`,
      )
    }

    const allowUnsettled = !!dto.allowUnsettledReceivables
    if (!allowUnsettled && preview.unsettledTotal > 0.009) {
      throw new BadRequestException(
        `尚有未结应收合计 ${preview.unsettledTotal.toFixed(2)}，请先收款结清或勾选允许未结清退租`,
      )
    }

    const endDate = preview.contract.endDate
    const termDateStr = dateOnlyStr(terminationDate)
    let kind = (s(dto.terminationKind) as 'expiry' | 'early') || ''
    if (kind !== 'expiry' && kind !== 'early') {
      kind = resolveTerminationKind(termDateStr, endDate, preview.lastBillingPeriodStart)
    }

    const loanById = new Map(preview.loanItems.map((x) => [x.id, x]))
    const checks = dto.loanChecks ?? []
    for (const item of preview.loanItems) {
      if (!checks.some((c) => s(c.loanFeeId) === item.id)) {
        throw new BadRequestException(`请验收借出物品：${item.description || item.id}`)
      }
    }

    const deductionRows: Array<{
      description: string
      quantity: number
      unitAmount: number
      subtotal: number
      remark: string
      returnStatus: string
      sourceLoanItemId: string | null
    }> = []

    for (const c of checks) {
      const loan = loanById.get(s(c.loanFeeId))
      if (!loan) throw new BadRequestException(`无效借出物品 ${c.loanFeeId}`)
      const st = s(c.status) as 'returned' | 'damaged' | 'missing'
      if (st !== 'returned' && st !== 'damaged' && st !== 'missing') {
        throw new BadRequestException('loanChecks[].status 须为 returned/damaged/missing')
      }
      if (st === 'returned') continue
      const label = st === 'damaged' ? '损坏' : '未归还'
      const amount =
        c.deductAmount != null && !Number.isNaN(Number(c.deductAmount))
          ? round2(Math.max(0, Number(c.deductAmount)))
          : round2(loan.subtotal)
      if (amount <= 0) continue
      deductionRows.push({
        description: `${loan.description || '借出物品'}（${label}扣除）`,
        quantity: 1,
        unitAmount: amount,
        subtotal: amount,
        remark: s(loan.remark),
        returnStatus: st,
        sourceLoanItemId: loan.id,
      })
    }

    for (const f of dto.extraDeductions ?? []) {
      const description = s(f.description)
      if (!description) continue
      const quantity = Number(f.quantity ?? 1)
      const unitAmount = Number(f.unitAmount ?? 0)
      const subtotal =
        f.subtotal != null && !Number.isNaN(Number(f.subtotal))
          ? Number(f.subtotal)
          : round2(quantity * unitAmount)
      deductionRows.push({
        description,
        quantity,
        unitAmount,
        subtotal: round2(subtotal),
        remark: s(f.remark),
        returnStatus: '',
        sourceLoanItemId: null,
      })
    }

    /** 钥匙／智能卡少还：按「未还数量 × 单价（按金÷借出数量）」自动扣除，金额可前端覆盖 */
    const pushKeyMissingDeduction = (
      label: string,
      issuedQty: number,
      returnedQty: number,
      deposit: number,
      overrideAmount: number | null | undefined,
    ) => {
      const issued = Math.max(0, Math.floor(Number(issuedQty) || 0))
      const returned = Math.max(0, Math.floor(Number(returnedQty) || 0))
      const missing = Math.max(0, issued - returned)
      if (missing <= 0 || issued <= 0) return
      const unit = round2(Math.max(0, deposit) / issued)
      const defaultAmt = round2(missing * unit)
      const amount =
        overrideAmount != null && !Number.isNaN(Number(overrideAmount))
          ? round2(Math.max(0, Number(overrideAmount)))
          : defaultAmt
      if (amount <= 0) return
      deductionRows.push({
        description: `${label}（未归还扣除）`,
        quantity: missing,
        unitAmount: missing > 0 ? round2(amount / missing) : amount,
        subtotal: amount,
        remark: `借出 ${issued}，回收 ${Math.min(returned, issued)}`,
        returnStatus: 'missing',
        sourceLoanItemId: null,
      })
    }

    pushKeyMissingDeduction(
      '房门匙',
      preview.contract.doorKeyQty,
      nonNegInt(dto.doorKeyReturnedQty, 'doorKeyReturnedQty'),
      Number(preview.contract.doorKeyDeposit) || 0,
      dto.doorKeyDeductAmount,
    )
    pushKeyMissingDeduction(
      '智能卡',
      preview.contract.mailboxKeyQty,
      nonNegInt(dto.smartCardReturnedQty, 'smartCardReturnedQty'),
      Number(preview.contract.mailboxKeyDeposit) || 0,
      dto.smartCardDeductAmount,
    )

    const deductionTotal = round2(deductionRows.reduce((sum, r) => sum + r.subtotal, 0))
    const totalDeposit = preview.totalDeposit
    const depositPaid = round2(Number(preview.depositPaid) || 0)
    /** 仅能退「已交按金 − 扣除」，未交部分不作退款 */
    const maxDepositRefund = round2(Math.max(0, depositPaid - deductionTotal))
    /** 扣除超过已收按金 → 超额赔偿毛额 */
    const excessCompensationGross = round2(Math.max(0, deductionTotal - depositPaid))
    const bookingBalance = round2(Math.max(0, preview.bookingDeposit.balance))
    /** 是否用定金余额先抵超额（开票金额为抵扣后净额） */
    const applyBookingToExcess =
      !!dto.applyBookingDepositToExcess &&
      excessCompensationGross > 0.009 &&
      bookingBalance > 0.009
    const bookingOffsetToExcess = applyBookingToExcess
      ? round2(Math.min(bookingBalance, excessCompensationGross))
      : 0
    const excessCompensation = round2(
      Math.max(0, excessCompensationGross - bookingOffsetToExcess),
    )
    const createExcessReceivable = excessCompensation > 0.009
    // 退租一律建立按金退还单；「已退／未退」由 depositRefundStatus 控制
    const createRefund = true
    let actualRefund =
      dto.actualRefundAmount != null && !Number.isNaN(Number(dto.actualRefundAmount))
        ? round2(Math.max(0, Number(dto.actualRefundAmount)))
        : maxDepositRefund
    if (actualRefund > maxDepositRefund + 0.009) {
      actualRefund = maxDepositRefund
    }
    // 一并退还定金 = 可用余额 − 已抵超额部分（未勾选抵扣时仍为全部余额）
    const bookingRefund = round2(Math.max(0, bookingBalance - bookingOffsetToExcess))

    // 退租一并建单默认视为已办理退还；前端可显式传「未退」表示稍后办理
    const refundStatusRaw = s(dto.depositRefundStatus) || '已退'
    const refundNow = refundStatusRaw === '已退' || refundStatusRaw === '部分已退'
    // 未退：允许空退款日；已退／部分已退：默认退租日
    const refundDate = refundNow
      ? parseDateOnly(dto.refundDate, 'refundDate') || terminationDate
      : parseDateOnly(dto.refundDate, 'refundDate')
    /** 按金应退上限；本次实退可小于上限（分次） */
    const roomRefundDue = maxDepositRefund
    const roomRefundedNow = refundNow ? actualRefund : 0
    const roomRefundPending = round2(Math.max(0, roomRefundDue - roomRefundedNow))
    let depositRefundStatus = '未退'
    if (refundNow) {
      depositRefundStatus =
        roomRefundPending > 0.009 && roomRefundedNow > 0.009
          ? '部分已退'
          : roomRefundedNow > 0.009 || roomRefundDue <= 0.009
            ? '已退'
            : '未退'
      // 此刻退还但实退为 0 且仍有应退 → 未退（剩余全挂 pending）
      if (roomRefundedNow <= 0.009 && roomRefundPending > 0.009) {
        depositRefundStatus = '未退'
      }
      if (roomRefundDue <= 0.009 && bookingRefund <= 0.009) {
        depositRefundStatus = '已退'
      }
    }
    const refundCode = createRefund ? await this.nextRefundCode() : ''
    const vacateRef = `退租办理 ${preview.contract.contractCode}`

    const doorKeyReturnedQty = nonNegInt(dto.doorKeyReturnedQty, 'doorKeyReturnedQty')
    const smartCardReturnedQty = nonNegInt(
      dto.smartCardReturnedQty,
      'smartCardReturnedQty',
    )
    const reason = s(dto.reason) || (kind === 'early' ? '提前退租' : '到期退租')
    const noticeAttachment = s(dto.noticeAttachment)
    const siteCondition = s(dto.siteCondition)
    const remark = s(dto.remark) || (kind === 'early' ? '提前退租' : '到期退租')

    const result = await this.prisma.$transaction(async (tx) => {
      let depositRefundId: string | null = null
      let depositRefundCode = ''
      if (createRefund) {
        const refund = await tx.depositRefund.create({
          data: {
            refundCode,
            contractId,
            customerId: preview.contract.customerId,
            roomId: preview.contract.roomId,
            status: depositRefundStatus,
            terminationDate,
            refundDate: depositRefundStatus === '未退' ? null : refundDate,
            totalDeposit: new Prisma.Decimal(totalDeposit),
            refundDueAmount: new Prisma.Decimal(roomRefundDue),
            actualRefundAmount: new Prisma.Decimal(roomRefundedNow),
            bookingDepositRefundAmount: new Prisma.Decimal(bookingRefund),
            handlerId: actorId,
            remark:
              kind === 'early'
                ? `提前退租办理 ${preview.contract.contractCode}`
                : `到期退租办理 ${preview.contract.contractCode}`,
            createdById: actorId,
            updatedById: actorId,
          },
          select: { id: true, refundCode: true },
        })
        depositRefundId = refund.id
        depositRefundCode = refund.refundCode
      }

      // 未交按金应收：作废按金发票 → 应收失效（不退未交部分）
      const unpaidDeposit = preview.unpaidDepositReceivables || []
      const depositInvoiceIds = [
        ...new Set(unpaidDeposit.map((r) => s(r.invoiceId)).filter(Boolean)),
      ]
      if (depositInvoiceIds.length) {
        const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
        for (const invoiceId of depositInvoiceIds) {
          const inv = await tx.invoice.findUnique({
            where: { id: invoiceId },
            select: { id: true, invoiceCode: true, status: true, changeLog: true },
          })
          if (!inv || s(inv.status) === '已取消') continue
          const prev = (inv.changeLog || '').trim()
          const logLine = `#inv|vacate_settlement|void_unpaid_deposit|${stamp}|${inv.invoiceCode || ''}|${preview.contract.contractCode}`
          await tx.invoice.update({
            where: { id: inv.id },
            data: {
              status: '已取消',
              changeLog: [logLine, ...(prev ? [prev] : [])].join('\n'),
              updatedById: actorId,
            },
          })
        }
      }

      const afterTerm = await tx.contract.update({
        where: { id: contractId },
        data: {
          status: '已退租',
          actualEndDate: terminationDate,
          updatedById: actorId,
        },
        select: { requirementId: true },
      })

      await this.customerRequirements.recomputeStatusFromContracts(
        afterTerm.requirementId,
        actorId,
        tx,
      )

      await this.syncRoomAfterTermination(tx, preview.contract.roomId, actorId)

      // 已办理实退按金：回写按金应收「已退金额」（已收保留）
      if (refundNow && actualRefund > 0.009) {
        await allocateRoomDepositRefundToReceivables(tx, contractId, actualRefund)
      }

      let excessInvoiceId: string | null = null
      let excessReceivableId: string | null = null
      let excessInvoiceCode = ''
      if (createExcessReceivable) {
        const detailHint = deductionRows
          .map((r) => r.description)
          .filter(Boolean)
          .slice(0, 5)
          .join('；')
        const offsetNote =
          bookingOffsetToExcess > 0.009
            ? `（已抵定金 ${bookingOffsetToExcess.toFixed(2)}）`
            : ''
        const createdInv = await this.invoiceAuto.createVacateExcessCompensationInvoice(
          {
            contractId,
            amount: excessCompensation,
            invoiceDate: terminationDate,
            paymentDueDate: terminationDate,
            description: '退租超出按金金额赔偿',
            lines: [
              {
                description: detailHint
                  ? `超出按金金额赔偿${offsetNote}（${detailHint}${deductionRows.length > 5 ? '…' : ''}）`
                  : `退租超出按金金额赔偿${offsetNote}`,
                quantity: 1,
                unitAmount: excessCompensation,
              },
            ],
            remark: `退租超出按金金额赔偿 ${vacateRef}`.trim(),
          },
          actorId,
          tx,
        )
        excessInvoiceId = createdInv.invoiceId
        excessReceivableId = createdInv.receivableId
        excessInvoiceCode = createdInv.invoiceCode
      }

      if (bookingOffsetToExcess > 0.009) {
        await this.bookingDeposit.consumeForVacateExcessOffset(
          {
            contractId,
            amount: bookingOffsetToExcess,
            movementDate: terminationDate,
            invoiceId: excessInvoiceId,
            remark: `退租超出按金金额赔偿定金抵扣 ${vacateRef}`.trim(),
          },
          actorId,
          tx,
        )
      }

      const settlementItems: Array<{
        itemType: ContractSettlementItemType
        description?: string
        amount: number
        quantity?: number
        unitAmount?: number
        returnStatus?: string
        sourceLoanItemId?: string | null
        receivableId?: string | null
        invoiceId?: string | null
        writeWriteoff?: boolean
        writeoffReasonType?: string
        remark?: string
      }> = []
      for (const f of deductionRows) {
        const amt = f.subtotal
        if (amt <= 0.009) continue
        const itemType =
          f.returnStatus === 'damaged'
            ? ContractSettlementItemType.DAMAGE_DEDUCTION
            : ContractSettlementItemType.PENALTY_DEDUCTION
        settlementItems.push({
          itemType,
          description: f.description,
          amount: amt,
          quantity: f.quantity,
          unitAmount: f.unitAmount,
          returnStatus: f.returnStatus,
          sourceLoanItemId: f.sourceLoanItemId,
          remark: f.returnStatus || f.remark || '',
        })
      }
      for (const r of unpaidDeposit) {
        if (r.openAmount <= 0.009) continue
        settlementItems.push({
          itemType: ContractSettlementItemType.VOID_RECEIVABLE,
          description: `退租作废未交按金 ${r.invoiceCode || r.receivableCode || ''}`.trim(),
          amount: r.openAmount,
          receivableId: r.id,
          invoiceId: r.invoiceId || null,
          writeWriteoff: true,
          writeoffReasonType: 'void_vacate',
        })
      }

      if (bookingOffsetToExcess > 0.009) {
        settlementItems.push({
          // 定金抵扣 ≠ 按金扣除，不计入 deductionTotal
          itemType: ContractSettlementItemType.BOOKING_DEPOSIT_OFFSET,
          description: '定金抵扣超出按金金额赔偿',
          amount: bookingOffsetToExcess,
          invoiceId: excessInvoiceId,
          remark: BOOKING_OFFSET_EXCESS_REMARK,
        })
      }
      if (
        excessCompensation > 0.009 &&
        excessInvoiceId &&
        excessReceivableId
      ) {
        settlementItems.push({
          itemType: ContractSettlementItemType.ADDITIONAL_CHARGE,
          description: `退租超出按金金额赔偿 ${excessInvoiceCode || ''}`.trim(),
          amount: excessCompensation,
          receivableId: excessReceivableId,
          invoiceId: excessInvoiceId,
          remark: 'excess_compensation',
        })
      }

      /** 应退总额 = 按金应退上限 + 定金（台账全额；分次出账另建退款单） */
      const refundDueTotal = round2(roomRefundDue + bookingRefund)
      if (refundDueTotal > 0.009) {
        settlementItems.push({
          itemType: ContractSettlementItemType.REFUND_ALLOCATION,
          description: '退租应退按金／定金',
          amount: refundDueTotal,
        })
      }

      const immediateItems = [
        ...(roomRefundedNow > 0.009
          ? [
              {
                itemType: 'room_deposit',
                description: '退租退还按金',
                amount: roomRefundedNow,
              },
            ]
          : []),
        ...(refundNow && bookingRefund > 0.009 && roomRefundedNow > 0.009
          ? [
              {
                itemType: 'booking_deposit',
                description: '退租一并退还定金',
                amount: bookingRefund,
              },
            ]
          : []),
      ]
      const immediateAmount = round2(
        immediateItems.reduce((sum, it) => sum + it.amount, 0),
      )

      const pendingItems = !refundNow
        ? [
            ...(roomRefundDue > 0.009
              ? [
                  {
                    itemType: 'room_deposit',
                    description: '退租退还按金',
                    amount: roomRefundDue,
                  },
                ]
              : []),
            ...(bookingRefund > 0.009
              ? [
                  {
                    itemType: 'booking_deposit',
                    description: '退租一并退还定金',
                    amount: bookingRefund,
                  },
                ]
              : []),
          ]
        : [
            ...(roomRefundPending > 0.009
              ? [
                  {
                    itemType: 'room_deposit',
                    description: '退租待退按金（分次）',
                    amount: roomRefundPending,
                  },
                ]
              : []),
            // 此刻退还但实退按金为 0：定金挂在 pending
            ...(roomRefundedNow <= 0.009 && bookingRefund > 0.009
              ? [
                  {
                    itemType: 'booking_deposit',
                    description: '退租一并退还定金',
                    amount: bookingRefund,
                  },
                ]
              : []),
          ]
      const pendingAmount = round2(
        pendingItems.reduce((sum, it) => sum + it.amount, 0),
      )

      const settlementMeta = await this.settlements.create(
        {
          type: ContractSettlementType.VACATE,
          contractId,
          customerId: preview.contract.customerId,
          roomId: preview.contract.roomId,
          settlementDate: terminationDate,
          terminationDate,
          depositTotal: preview.totalDeposit,
          remark,
          vacateFields: {
            terminationKind: kind,
            reason,
            noticeAttachment,
            doorKeyReturnedQty,
            smartCardReturnedQty,
            siteCondition,
          },
          depositRefundId,
          items: settlementItems,
          actorId,
          immediateRefund:
            refundNow && immediateAmount > 0.009
              ? {
                  amount: immediateAmount,
                  refundDate: refundDate || terminationDate,
                  handlerId: actorId,
                  remark: `退租办理已退 ${depositRefundCode || ''}`.trim(),
                  depositRefundId,
                  items: immediateItems,
                }
              : null,
          pendingRefund:
            pendingAmount > 0.009
              ? {
                  amount: pendingAmount,
                  handlerId: actorId,
                  remark: `退租办理待退 ${depositRefundCode || ''}`.trim(),
                  depositRefundId,
                  items: pendingItems,
                }
              : null,
          changeLogSummary: `退租结算：${kind === 'early' ? '提前' : '到期'}，扣除 ${deductionTotal.toFixed(2)}`,
        },
        tx,
      )

      return {
        settlementId: settlementMeta.settlementId,
        settlementCode: settlementMeta.settlementCode,
        refundOrderId: settlementMeta.refundOrderId,
        refundOrderCode: settlementMeta.refundOrderCode,
        depositRefundId,
        depositRefundCode,
        deductionTotal,
        actualRefund: roomRefundedNow,
        roomRefundDue,
        roomRefundPending,
        bookingRefund,
        excessCompensationGross,
        excessCompensation,
        bookingOffsetToExcess,
        excessInvoiceId,
        excessReceivableId,
        excessInvoiceCode,
      }
    })

    // 此刻退还且本笔已退按金＞0：定金整笔随第一笔出账同步；未退则待打款再同步
    if (
      result.depositRefundId &&
      refundNow &&
      result.bookingRefund > 0.009 &&
      result.actualRefund > 0.009
    ) {
      await this.bookingDeposit.syncDepositRefundBookingAmount(
        result.depositRefundId,
        contractId,
        result.bookingRefund,
        dateOnlyStr(refundDate),
        actorId,
      )
    }

    const row = await this.prisma.contractSettlement.findUniqueOrThrow({
      where: { id: result.settlementId },
      include: settlementInclude,
    })

    return {
      settlement: toContractSettlementDto(row),
      depositRefundId: result.depositRefundId,
      depositRefundCode: result.depositRefundCode,
      deductionTotal: result.deductionTotal,
      actualRefundAmount: result.actualRefund,
      bookingDepositRefundAmount: result.bookingRefund,
      terminationKind: kind,
      settlementId: result.settlementId,
      settlementCode: result.settlementCode,
      refundOrderId: result.refundOrderId,
      refundOrderCode: result.refundOrderCode,
      excessCompensationGross: result.excessCompensationGross,
      excessCompensation: result.excessCompensation,
      bookingOffsetToExcess: result.bookingOffsetToExcess,
      excessInvoiceId: result.excessInvoiceId,
      excessReceivableId: result.excessReceivableId,
      excessInvoiceCode: result.excessInvoiceCode,
    }
  }

  private async nextRefundCode() {
    const now = new Date()
    const y = String(now.getFullYear()).slice(-2)
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const prefix = `DRF${y}${m}${d}`
    const latest = await this.prisma.depositRefund.findFirst({
      where: { refundCode: { startsWith: prefix } },
      orderBy: { refundCode: 'desc' },
      select: { refundCode: true },
    })
    let seq = 1
    if (latest) {
      const n = Number(latest.refundCode.slice(prefix.length))
      if (!Number.isNaN(n)) seq = n + 1
    }
    return `${prefix}${String(seq).padStart(4, '0')}`
  }

  private async syncRoomAfterTermination(
    tx: Prisma.TransactionClient,
    roomId: string,
    actorId: string | null,
  ) {
    const room = await tx.room.findUnique({
      where: { id: roomId },
      select: { leaseCapability: true, splitLabels: true },
    })
    const occupying = await tx.contract.findMany({
      where: { roomId, status: { in: [...OCCUPYING_CONTRACT_STATUSES] } },
      select: {
        contractCode: true,
        status: true,
        occupancyMode: true,
        partLabel: true,
      },
      orderBy: { updatedAt: 'desc' },
    })
    const occupancy = buildRoomOccupancy(
      {
        leaseCapability: room?.leaseCapability || RoomLeaseCapability.flexible,
        splitLabels: room?.splitLabels || [],
      },
      occupying.map((c) => ({
        id: c.contractCode,
        contractCode: c.contractCode,
        status: c.status,
        occupancyMode: c.occupancyMode,
        partLabel: c.partLabel,
      })),
    )
    let latest = ''
    if (occupancy.wholeOccupied) {
      latest = occupancy.wholeContractCode || occupying[0]?.contractCode || ''
    } else if (occupancy.slots.some((x) => x.occupied)) {
      latest = occupancy.slots
        .filter((x) => x.occupied)
        .map((x) => `${x.label}:${x.contractCode || ''}`)
        .join(' / ')
    } else if (occupying[0]) {
      latest = occupying[0].contractCode
    }
    await tx.room.update({
      where: { id: roomId },
      data: {
        latestContract: latest || null,
        status: aggregateRoomStatus(occupying),
        ...(actorId ? { updatedById: actorId } : {}),
      },
    })
  }
}
