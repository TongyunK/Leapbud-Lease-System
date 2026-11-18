import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BookingDepositMovementType,
  Prisma,
  ReceiptKind,
  RoomLeaseCapability,
} from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { InvoiceAutoService } from '../invoices/invoice-auto.service'
import { BookingDepositService } from '../receipts/booking-deposit.service'
import { NumberingRulesService } from '../numbering-rules/numbering-rules.service'
import { NumberingBizKey } from '@prisma/client'
import {
  contractInclude,
  toContractDto,
} from './contract.mapper'
import type {
  RenewContractDto,
  ContractPeriodInputDto,
  ContractLoanItemInputDto,
} from './dto/contract.dto'
import {
  OCCUPYING_CONTRACT_STATUSES,
  aggregateRoomStatus,
  buildRoomOccupancy,
  contractCodeRoomBase,
  normalizeOccupancyMode,
  normalizeSplitLabels,
} from '../common/room-lease'

const INVOICE_TYPE_DEPOSIT = 'Deposit'

function s(v?: string | null) {
  return (v ?? '').trim()
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function dec(n: number) {
  return new Prisma.Decimal(round2(n))
}

function parseDateOnly(v: string | null | undefined, field: string): Date {
  const raw = s(v)
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`)
  }
  return new Date(`${raw}T00:00:00.000Z`)
}

function dateOnlyStr(d: Date | null | undefined): string {
  if (!d) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isDepositInvoiceType(raw?: string | null) {
  const t = s(raw).toLowerCase()
  if (!t) return false
  if (t === 'deposit') return true
  if (t.includes('按金')) return true
  return t.includes('deposit')
}

const RENEWABLE_STATUSES = new Set(['租賃中'])

@Injectable()
export class ContractRenewalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceAuto: InvoiceAutoService,
    private readonly bookingDeposit: BookingDepositService,
    private readonly numbering: NumberingRulesService,
  ) {}

  /** 续约预览：可迁按金／定金、欠租提示 */
  async preview(sourceContractId: string) {
    const id = s(sourceContractId)
    if (!id) throw new BadRequestException('contractId is required')
    const source = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        room: {
          select: {
            id: true,
            roomCode: true,
            name: true,
            leaseCapability: true,
            splitLabels: true,
          },
        },
        customer: { select: { id: true, customerCode: true, name: true } },
        loanItems: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            description: true,
            quantity: true,
            unitAmount: true,
            subtotal: true,
            remark: true,
            sortOrder: true,
          },
        },
        periods: {
          orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }],
          select: {
            dateType: true,
            dateUnit: true,
            dateValue: true,
            startDate: true,
            endDate: true,
            sortOrder: true,
          },
        },
        renewedTo: { select: { id: true, contractCode: true } },
      },
    })
    if (!source) throw new NotFoundException(`Contract ${id} not found`)

    const renewable = RENEWABLE_STATUSES.has(source.status) && !source.renewedTo
    const roomDepositPaid = await this.calcRoomDepositPaid(id)
    const booking = await this.bookingDeposit.getAccountByContractId(id)
    const outstandingRent = await this.calcOutstandingRent(id)
    const loanItemsDeposit = round2(
      source.loanItems.reduce((sum, f) => sum + Number(f.subtotal?.toString() ?? 0), 0),
    )

    const roomDepositSnapshot = {
      roomDeposit: round2(Number(source.roomDeposit?.toString() ?? 0)),
      miscDeposit: round2(Number(source.miscDeposit?.toString() ?? 0)),
      doorKeyDeposit: round2(Number(source.doorKeyDeposit?.toString() ?? 0)),
      mailboxKeyDeposit: round2(Number(source.mailboxKeyDeposit?.toString() ?? 0)),
      loanItemsDeposit,
    }

    return {
      renewable,
      blockReason: !RENEWABLE_STATUSES.has(source.status)
        ? `当前状态「${source.status}」不可续约（须租賃中）`
        : source.renewedTo
          ? `已续约至「${source.renewedTo.contractCode}」`
          : '',
      source: {
        id: source.id,
        contractCode: source.contractCode,
        status: source.status,
        customerId: source.customerId,
        customerCode: source.customer?.customerCode ?? '',
        customerName: source.customer?.name ?? '',
        roomId: source.roomId,
        roomCode: source.room?.roomCode ?? '',
        roomName: source.room?.name ?? '',
        occupancyMode: source.occupancyMode,
        partLabel: source.partLabel,
        leaseType: source.leaseType,
        paymentCycle: source.paymentCycle,
        electricityRate: source.electricityRate == null ? null : Number(source.electricityRate),
        monthlyRent: source.monthlyRent == null ? null : Number(source.monthlyRent),
        startDate: dateOnlyStr(source.startDate),
        endDate: dateOnlyStr(source.endDate),
        doorKeyQty: source.doorKeyQty,
        mailboxKeyQty: source.mailboxKeyQty,
        periods: source.periods.map((p) => ({
          dateType: p.dateType,
          dateUnit: p.dateUnit,
          dateValue: p.dateValue,
          startDate: dateOnlyStr(p.startDate),
          endDate: dateOnlyStr(p.endDate),
          sortOrder: p.sortOrder,
        })),
        loanItemCount: source.loanItems.length,
        loanItems: source.loanItems.map((f, i) => ({
          description: f.description,
          quantity: Number(f.quantity?.toString() ?? 0),
          unitAmount: Number(f.unitAmount?.toString() ?? 0),
          subtotal: Number(f.subtotal?.toString() ?? 0),
          remark: f.remark || '',
          sortOrder: f.sortOrder ?? i,
        })),
        roomNameText: source.roomNameText || source.room?.name || '',
        ...roomDepositSnapshot,
      },
      transfer: {
        roomDepositTransferred: roomDepositPaid,
        bookingDepositTransferred: booking.balance,
        loanItemsMigrated: source.loanItems.length,
        loanItemsDeposit,
        noDepositAdjust: true,
      },
      outstandingRent,
      hint:
        outstandingRent > 0.009
          ? `旧约仍有未收租金 ${outstandingRent.toFixed(2)}，续约后仍在旧约收取，不阻断续约`
          : '',
    }
  }

  async renew(sourceContractId: string, dto: RenewContractDto, actorId?: string | null) {
    const sourceId = s(sourceContractId)
    if (!sourceId) throw new BadRequestException('contractId is required')
    const preview = await this.preview(sourceId)
    if (!preview.renewable) {
      throw new BadRequestException(preview.blockReason || '不可续约')
    }

    const monthlyRent = Number(dto.monthlyRent)
    if (!Number.isFinite(monthlyRent) || monthlyRent < 0) {
      throw new BadRequestException('请填写有效月租')
    }
    const startDate = parseDateOnly(dto.startDate, 'startDate')
    const endDate = parseDateOnly(dto.endDate, 'endDate')
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('结束日期不可早于开始日期')
    }

    const source = await this.prisma.contract.findUniqueOrThrow({
      where: { id: sourceId },
      include: {
        room: true,
        loanItems: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })

    const periods = this.buildPeriods(dto.periods, startDate, endDate)
    const paymentCycle = s(dto.paymentCycle) || source.paymentCycle
    const electricityRate =
      dto.electricityRate !== undefined
        ? dto.electricityRate
        : source.electricityRate == null
          ? null
          : Number(source.electricityRate)
    const remark = s(dto.remark)
    const actor = actorId || null
    const transferDate = startDate
    const roomDepositPaid = preview.transfer.roomDepositTransferred
    const bookingBalance = preview.transfer.bookingDepositTransferred
    const transferGroupId = randomUUID()

    const occupancyMode = normalizeOccupancyMode(source.occupancyMode)
    const partLabel =
      occupancyMode === 'part'
        ? s(source.partLabel).toUpperCase() || s(source.subleaseMark).toUpperCase()
        : ''
    await this.assertOccupancyFree(source.room, occupancyMode, partLabel, sourceId)

    const codeBase = contractCodeRoomBase({
      roomCode: source.room.roomCode,
      leaseCapability: source.room.leaseCapability,
      occupancyMode,
      partLabel,
    })
    const contractCode = await this.nextContractCode(codeBase)

    try {
      const createdId = await this.prisma.$transaction(async (tx) => {
        // 先释放旧约占用，再占新约
        await tx.contract.update({
          where: { id: sourceId },
          data: {
            status: '已續約',
            updatedById: actor,
          },
        })

        const created = await tx.contract.create({
          data: {
            contractCode,
            roomId: source.roomId,
            customerId: source.customerId,
            salesManagerId: source.salesManagerId,
            requirementId: source.requirementId,
            startDate,
            endDate,
            leaseType: source.leaseType,
            occupancyMode,
            partLabel,
            status: '租賃中',
            roomDeposit: source.roomDeposit,
            monthlyRent: dec(monthlyRent),
            bookingDeposit: bookingBalance > 0.009 ? dec(bookingBalance) : dec(0),
            paymentDate: bookingBalance > 0.009 ? transferDate : null,
            paymentCycle,
            paymentMethod: bookingBalance > 0.009 ? source.paymentMethod || '續約遷移' : '',
            paymentVoucher: '',
            electricityRate:
              electricityRate == null ? null : new Prisma.Decimal(electricityRate),
            miscDeposit: source.miscDeposit,
            doorKeyQty:
              dto.doorKeyQty !== undefined && dto.doorKeyQty !== null
                ? Math.max(0, Math.trunc(Number(dto.doorKeyQty) || 0))
                : source.doorKeyQty,
            mailboxKeyQty:
              dto.mailboxKeyQty !== undefined && dto.mailboxKeyQty !== null
                ? Math.max(0, Math.trunc(Number(dto.mailboxKeyQty) || 0))
                : source.mailboxKeyQty,
            // 按金不调差：钥匙按金金额沿用旧约已收口径
            doorKeyDeposit: source.doorKeyDeposit,
            mailboxKeyDeposit: source.mailboxKeyDeposit,
            roomNameText: source.roomNameText || source.room.name,
            subleaseMark: occupancyMode === 'part' ? partLabel : '',
            attachment: source.attachment,
            remark: remark || `續約自 ${source.contractCode}`,
            renewedFromId: sourceId,
            createdById: actor,
            updatedById: actor,
          },
        })

        if (periods.length) {
          await tx.contractPeriod.createMany({
            data: periods.map((p, i) => ({
              contractId: created.id,
              dateType: p.dateType,
              dateUnit: p.dateUnit || '月',
              dateValue: p.dateValue ?? 0,
              startDate: p.startDate,
              endDate: p.endDate,
              sortOrder: p.sortOrder ?? i,
            })),
          })
        }

        // 借出物品：仅写入新约（可改数量）；旧约清单与按金发票不动；迁移按金仍按旧约已收口径
        const loanRows = this.buildLoanItemsForNewContract(dto.loanItems, source.loanItems)
        if (loanRows.length) {
          await tx.contractLoanItem.createMany({
            data: loanRows.map((f, i) => ({
              contractId: created.id,
              description: f.description,
              quantity: dec(f.quantity),
              unitAmount: dec(f.unitAmount),
              subtotal: dec(f.subtotal),
              remark: f.remark,
              sortOrder: f.sortOrder ?? i,
              createdById: actor,
              updatedById: actor,
            })),
          })
        }

        await tx.contractDepositTransfer.create({
          data: {
            fromContractId: sourceId,
            toContractId: created.id,
            transferDate,
            roomDepositTransferred: dec(roomDepositPaid),
            roomDepositAmount: source.roomDeposit ?? dec(0),
            miscDepositAmount: source.miscDeposit ?? dec(0),
            doorKeyDepositAmount: source.doorKeyDeposit ?? dec(0),
            mailboxKeyDepositAmount: source.mailboxKeyDeposit ?? dec(0),
            // 按金不调差：借出物按金快照取旧约原小计合计，不随新约数量改写
            loanItemsDepositAmount: dec(
              source.loanItems.reduce(
                (sum, f) => sum + Number(f.subtotal?.toString() ?? 0),
                0,
              ),
            ),
            bookingDepositTransferred: dec(bookingBalance),
            remark: `續約遷移 ${source.contractCode} → ${contractCode}`,
            createdById: actor,
            updatedById: actor,
          },
        })

        if (bookingBalance > 0.009) {
          await this.transferBookingDeposit(
            tx,
            {
              fromContractId: sourceId,
              fromContractCode: source.contractCode,
              toContractId: created.id,
              toContractCode: contractCode,
              toCustomerId: source.customerId,
              amount: bookingBalance,
              transferDate,
              transferGroupId,
              paymentMethod: source.paymentMethod || '續約遷移',
              actorId: actor,
            },
          )
        }

        // 仅首期租金；按金不重开（已迁入）
        await this.invoiceAuto.ensureInitialInvoicesOnIssue(created.id, actor, tx, {
          skipDeposit: true,
        })

        await this.syncRoomStatus(tx, source.roomId, actor)

        return created.id
      })

      const row = await this.prisma.contract.findUniqueOrThrow({
        where: { id: createdId },
        include: contractInclude,
      })
      return {
        contract: toContractDto(row),
        transfer: {
          roomDepositTransferred: roomDepositPaid,
          bookingDepositTransferred: bookingBalance,
        },
        sourceContractId: sourceId,
        sourceContractCode: source.contractCode,
      }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`合约编号或续约链冲突，请重试`)
      }
      throw e
    }
  }

  async listTransfers(contractId: string) {
    const id = s(contractId)
    if (!id) throw new BadRequestException('contractId is required')
    const rows = await this.prisma.contractDepositTransfer.findMany({
      where: {
        OR: [{ fromContractId: id }, { toContractId: id }],
      },
      include: {
        fromContract: { select: { id: true, contractCode: true } },
        toContract: { select: { id: true, contractCode: true } },
      },
      orderBy: [{ transferDate: 'asc' }, { createdAt: 'asc' }],
    })
    return rows.map((r) => ({
      id: r.id,
      fromContractId: r.fromContractId,
      fromContractCode: r.fromContract.contractCode,
      toContractId: r.toContractId,
      toContractCode: r.toContract.contractCode,
      transferDate: dateOnlyStr(r.transferDate),
      roomDepositTransferred: round2(Number(r.roomDepositTransferred.toString())),
      bookingDepositTransferred: round2(Number(r.bookingDepositTransferred.toString())),
      remark: r.remark,
      direction: r.toContractId === id ? 'in' : 'out',
    }))
  }

  private async calcRoomDepositPaid(contractId: string) {
    const receivables = await this.prisma.receivable.findMany({
      where: { contractId },
      select: {
        receivedAmount: true,
        invoice: { select: { invoiceType: true, status: true } },
      },
    })
    let paid = 0
    for (const r of receivables) {
      if (!isDepositInvoiceType(r.invoice?.invoiceType)) continue
      if (s(r.invoice?.status) === '已取消') continue
      paid = round2(paid + Number(r.receivedAmount?.toString() ?? 0))
    }
    if (paid > 0.009) {
      // 扣已迁出
      const out = await this.prisma.contractDepositTransfer.aggregate({
        where: { fromContractId: contractId },
        _sum: { roomDepositTransferred: true },
      })
      const inAgg = await this.prisma.contractDepositTransfer.aggregate({
        where: { toContractId: contractId },
        _sum: { roomDepositTransferred: true },
      })
      paid = round2(
        Math.max(
          0,
          paid +
            Number(inAgg._sum.roomDepositTransferred?.toString() ?? 0) -
            Number(out._sum.roomDepositTransferred?.toString() ?? 0),
        ),
      )
      return paid
    }
    // fallback + transfers
    const invs = await this.prisma.invoice.findMany({
      where: {
        contractId,
        status: { not: '已取消' },
        OR: [
          { invoiceType: INVOICE_TYPE_DEPOSIT },
          { invoiceType: { contains: '按金' } },
        ],
      },
      select: {
        receivables: { select: { receivedAmount: true } },
      },
    })
    for (const inv of invs) {
      for (const r of inv.receivables) {
        paid = round2(paid + Number(r.receivedAmount?.toString() ?? 0))
      }
    }
    const out = await this.prisma.contractDepositTransfer.aggregate({
      where: { fromContractId: contractId },
      _sum: { roomDepositTransferred: true },
    })
    const inAgg = await this.prisma.contractDepositTransfer.aggregate({
      where: { toContractId: contractId },
      _sum: { roomDepositTransferred: true },
    })
    return round2(
      Math.max(
        0,
        paid +
          Number(inAgg._sum.roomDepositTransferred?.toString() ?? 0) -
          Number(out._sum.roomDepositTransferred?.toString() ?? 0),
      ),
    )
  }

  private async calcOutstandingRent(contractId: string) {
    const rows = await this.prisma.receivable.findMany({
      where: { contractId },
      select: {
        receivableAmount: true,
        invoice: { select: { invoiceType: true, status: true } },
      },
    })
    let sum = 0
    for (const r of rows) {
      if (s(r.invoice?.status) === '已取消') continue
      if (isDepositInvoiceType(r.invoice?.invoiceType)) continue
      const open = round2(Number(r.receivableAmount?.toString() ?? 0))
      if (open > 0.009) sum = round2(sum + open)
    }
    return sum
  }

  private buildPeriods(
    input: ContractPeriodInputDto[] | undefined,
    startDate: Date,
    endDate: Date,
  ): Array<{
    dateType: string
    dateUnit: string
    dateValue: number
    startDate: Date
    endDate: Date
    sortOrder: number
  }> {
    if (input?.length) {
      return input.map((p, i) => ({
        dateType: s(p.dateType) || '使用期',
        dateUnit: s(p.dateUnit) || '月',
        dateValue: Number(p.dateValue) || 0,
        startDate: parseDateOnly(p.startDate, 'periods.startDate'),
        endDate: parseDateOnly(p.endDate, 'periods.endDate'),
        sortOrder: p.sortOrder ?? i,
      }))
    }
    return [
      {
        dateType: '使用期',
        dateUnit: '月',
        dateValue: 0,
        startDate,
        endDate,
        sortOrder: 0,
      },
    ]
  }

  /**
   * 新约借出物品：可用 dto 覆盖数量；描述／单价以提交为准（前端默认带旧约值）。
   * 省略 dto 时按旧约原样复制。不改旧约数据。
   */
  private buildLoanItemsForNewContract(
    input: ContractLoanItemInputDto[] | undefined,
    sourceItems: Array<{
      description: string
      quantity: Prisma.Decimal
      unitAmount: Prisma.Decimal
      subtotal: Prisma.Decimal
      remark: string
      sortOrder: number
    }>,
  ): Array<{
    description: string
    quantity: number
    unitAmount: number
    subtotal: number
    remark: string
    sortOrder: number
  }> {
    if (input?.length) {
      return input
        .map((f, i) => {
          const description = s(f.description)
          if (!description) return null
          const quantity = Math.max(0, Number(f.quantity) || 0)
          const unitAmount = Math.max(0, Number(f.unitAmount) || 0)
          const subtotal =
            f.subtotal !== undefined && f.subtotal !== null && Number.isFinite(Number(f.subtotal))
              ? Math.max(0, round2(Number(f.subtotal)))
              : round2(quantity * unitAmount)
          return {
            description,
            quantity: round2(quantity),
            unitAmount: round2(unitAmount),
            subtotal,
            remark: s(f.remark),
            sortOrder: f.sortOrder ?? i,
          }
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
    }
    return sourceItems.map((f, i) => ({
      description: f.description,
      quantity: round2(Number(f.quantity?.toString() ?? 0)),
      unitAmount: round2(Number(f.unitAmount?.toString() ?? 0)),
      subtotal: round2(Number(f.subtotal?.toString() ?? 0)),
      remark: f.remark || '',
      sortOrder: f.sortOrder ?? i,
    }))
  }

  private async assertOccupancyFree(
    room: {
      id: string
      leaseCapability: RoomLeaseCapability | string
      splitLabels: string[]
    },
    mode: 'whole' | 'part',
    partLabel: string,
    excludeContractId: string,
  ) {
    const others = await this.prisma.contract.findMany({
      where: {
        roomId: room.id,
        status: { in: [...OCCUPYING_CONTRACT_STATUSES] },
        id: { not: excludeContractId },
      },
      select: {
        id: true,
        contractCode: true,
        status: true,
        occupancyMode: true,
        partLabel: true,
        customer: { select: { name: true } },
      },
    })
    const occupancy = buildRoomOccupancy(
      {
        leaseCapability: room.leaseCapability,
        splitLabels: normalizeSplitLabels(room.splitLabels),
      },
      others.map((c) => ({
        id: c.id,
        contractCode: c.contractCode,
        status: c.status,
        occupancyMode: c.occupancyMode,
        partLabel: c.partLabel,
        customerName: c.customer?.name,
      })),
    )
    if (mode === 'whole') {
      if (occupancy.wholeOccupied || occupancy.slots.some((x) => x.occupied)) {
        throw new BadRequestException('该房间已有占用中的合约，无法续约整租')
      }
    } else {
      if (occupancy.wholeOccupied) {
        throw new BadRequestException('该房间整租占用中，无法续约分租')
      }
      const slot = occupancy.slots.find((x) => x.label === partLabel)
      if (slot?.occupied) {
        throw new BadRequestException(`份位「${partLabel}」已被占用，无法续约`)
      }
    }
  }

  private async nextContractCode(roomCode: string) {
    const base = s(roomCode)
    if (!base) throw new BadRequestException('roomCode is required')
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const datePart = `${y}${m}${d}`
    const taken = async (code: string) =>
      !!(await this.prisma.contract.findFirst({
        where: { contractCode: code },
        select: { id: true },
      }))
    let code = `${base}-${datePart}`
    if (!(await taken(code))) return code
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const ss = String(now.getSeconds()).padStart(2, '0')
    code = `${base}-${datePart}${hh}${mm}${ss}`
    let guard = 0
    while ((await taken(code)) && guard < 100) {
      guard += 1
      code = `${base}-${datePart}${hh}${mm}${ss}-${guard}`
    }
    return code
  }

  private async transferBookingDeposit(
    tx: Prisma.TransactionClient,
    opts: {
      fromContractId: string
      fromContractCode: string
      toContractId: string
      toContractCode: string
      toCustomerId: string
      amount: number
      transferDate: Date
      transferGroupId: string
      paymentMethod: string
      actorId: string | null
    },
  ) {
    const account = await this.bookingDeposit.getAccountByContractId(opts.fromContractId)
    if (opts.amount > account.balance + 0.009) {
      throw new BadRequestException(
        `定金余额不足（可用 ${account.balance.toFixed(2)}），无法迁移`,
      )
    }
    if (!account.receipts.length) {
      throw new BadRequestException('旧约无定金收据，无法迁移定金')
    }

    const balances = await this.listReceiptBalances(
      tx,
      account.receipts.map((r) => ({ id: r.id, amount: r.amount })),
    )
    let left = opts.amount
    const outDate = dateOnlyStr(opts.transferDate)
    const toCode = s(opts.toContractCode)
    const fromCode = s(opts.fromContractCode)
    for (const rb of balances) {
      if (left <= 0.009) break
      const take = round2(Math.min(rb.balance, left))
      if (take <= 0.009) continue
      await tx.bookingDepositMovement.create({
        data: {
          bookingDepositReceiptId: rb.id,
          contractId: opts.fromContractId,
          type: BookingDepositMovementType.transfer_out,
          amount: dec(take),
          movementDate: opts.transferDate,
          relatedContractId: opts.toContractId,
          transferGroupId: opts.transferGroupId,
          remark: toCode ? `續約定金轉出 → ${toCode}` : '續約定金轉出',
          createdById: opts.actorId,
          updatedById: opts.actorId,
        },
      })
      const outLine = `#bd|transfer_out|${outDate}|${take.toFixed(2)}|${toCode}`
      const outPrev = (
        await tx.receipt.findUnique({
          where: { id: rb.id },
          select: { changeLog: true },
        })
      )?.changeLog?.trim()
      await tx.receipt.update({
        where: { id: rb.id },
        data: { changeLog: outPrev ? `${outPrev}\n${outLine}` : outLine },
      })
      rb.balance = round2(rb.balance - take)
      left = round2(left - take)
    }
    if (left > 0.009) {
      throw new BadRequestException('定金余额已变化，请刷新后重试')
    }

    const receiptCode = await this.numbering.nextCode(NumberingBizKey.receipt, {
      isTaken: async (code) =>
        !!(await tx.receipt.findFirst({
          where: { receiptCode: code },
          select: { id: true },
        })),
    })
    const inDate = dateOnlyStr(opts.transferDate)
    const newReceipt = await tx.receipt.create({
      data: {
        receiptCode,
        kind: ReceiptKind.booking_deposit,
        customerId: opts.toCustomerId,
        contractId: opts.toContractId,
        paymentDate: opts.transferDate,
        paymentMethod: opts.paymentMethod || '續約遷移',
        amount: dec(opts.amount),
        remark: fromCode ? `續約定金遷入 ← ${fromCode}` : '續約定金遷入',
        changeLog: `#bd|transfer_in|${inDate}|${opts.amount.toFixed(2)}|${fromCode}`,
        createdById: opts.actorId,
        updatedById: opts.actorId,
      },
      select: { id: true },
    })
    await tx.contract.update({
      where: { id: opts.toContractId },
      data: { bookingDepositReceiptId: newReceipt.id },
    })
    await tx.bookingDepositMovement.create({
      data: {
        bookingDepositReceiptId: newReceipt.id,
        contractId: opts.toContractId,
        type: BookingDepositMovementType.transfer_in,
        amount: dec(opts.amount),
        movementDate: opts.transferDate,
        relatedContractId: opts.fromContractId,
        transferGroupId: opts.transferGroupId,
        remark: fromCode ? `續約定金遷入 ← ${fromCode}` : '續約定金遷入',
        createdById: opts.actorId,
        updatedById: opts.actorId,
      },
    })
  }

  private async listReceiptBalances(
    tx: Prisma.TransactionClient,
    receipts: Array<{ id: string; amount: number }>,
  ) {
    if (!receipts.length) return [] as Array<{ id: string; balance: number }>
    const ids = receipts.map((r) => r.id)
    const rows = await tx.bookingDepositMovement.groupBy({
      by: ['bookingDepositReceiptId', 'type'],
      where: {
        bookingDepositReceiptId: { in: ids },
        type: {
          in: [
            BookingDepositMovementType.apply,
            BookingDepositMovementType.refund,
            BookingDepositMovementType.forfeit,
            BookingDepositMovementType.transfer_out,
          ],
        },
      },
      _sum: { amount: true },
    })
    const usedById = new Map<string, number>()
    for (const r of rows) {
      const id = r.bookingDepositReceiptId
      const amt = Number(r._sum.amount?.toString() ?? 0)
      usedById.set(id, round2((usedById.get(id) ?? 0) + (Number.isFinite(amt) ? amt : 0)))
    }
    return receipts.map((r) => ({
      id: r.id,
      balance: round2(Math.max(0, r.amount - (usedById.get(r.id) ?? 0))),
    }))
  }

  private async syncRoomStatus(
    tx: Prisma.TransactionClient,
    roomId: string,
    actorId: string | null,
  ) {
    const occupying = await tx.contract.findMany({
      where: {
        roomId,
        status: { in: [...OCCUPYING_CONTRACT_STATUSES] },
      },
      select: { status: true },
    })
    const status = aggregateRoomStatus(occupying)
    await tx.room.update({
      where: { id: roomId },
      data: { status, updatedById: actorId },
    })
  }
}
