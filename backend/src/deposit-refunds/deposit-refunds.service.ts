import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common'
import {
  BookingDepositMovementType,
  Prisma,
  RefundOrderStatus,
} from '@prisma/client'
import { ContractSettlementsService } from '../contract-settlements/contract-settlements.service'
import { RefundOrdersService } from '../contract-settlements/refund-orders.service'
import { createReadStream } from 'fs'
import { promises as fs } from 'fs'
import * as path from 'path'
import { PrismaService } from '../prisma/prisma.service'
import { BuildingAccessService } from '../building-access/building-access.service'
import { BookingDepositService } from '../receipts/booking-deposit.service'
import { allocateRoomDepositRefundToReceivables } from '../receipts/receivable-received.sync'
import {
  CreateDepositRefundDto,
  ImportDepositRefundsDto,
  UpdateDepositRefundDto,
} from './dto/deposit-refund.dto'
import {
  depositRefundAttachmentStorageRel,
  depositRefundInclude,
  isExternalDepositRefundAttachmentKey,
  toDepositRefundAttachmentDto,
  toDepositRefundDto,
} from './deposit-refund.mapper'
import {
  dateRangeFilter,
  paginateArgs,
  parsePage,
  parsePageSize,
  parseSortDir,
  splitCsv,
  type PaginatedResult,
} from '../common/pagination'
import { runBatchRemove } from '../common/batch-delete'
import { pushImportIssue, type ImportIssue } from '../common/import-result'
import { actorLabelsOrEmpty } from '../common/audit'
import { numberFieldInOrEmpty, stringFieldInOrEmpty } from '../common/column-filter'

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

function decimalField(v: number | null | undefined, field: string): Prisma.Decimal {
  const n = Number(v ?? 0)
  if (Number.isNaN(n)) throw new BadRequestException(`${field} must be a number`)
  return new Prisma.Decimal(n)
}

function nullId(v?: string | null): string | null {
  const t = s(v)
  return t || null
}

function uploadsRoot() {
  return path.join(process.cwd(), 'uploads')
}

function decodeMulterFilename(name: string): string {
  const raw = s(name)
  if (!raw) return raw
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8')
    if (decoded.includes('\uFFFD')) return raw
    const rawHasCjk = /[\u4e00-\u9fff]/.test(raw)
    const decodedHasCjk = /[\u4e00-\u9fff]/.test(decoded)
    if (!rawHasCjk && decodedHasCjk) return decoded
    return raw
  } catch {
    return raw
  }
}

function safeAttachmentFileName(original: string): string {
  const decoded = decodeMulterFilename(original) || 'file.bin'
  const base = path.basename(decoded).replace(/[\\/]/g, '_')
  if (!base || base.includes('..')) {
    throw new BadRequestException('非法文件名')
  }
  return base
}

function assertAttachmentFile(file: Express.Multer.File) {
  if (!file?.buffer?.length) {
    throw new BadRequestException('请上传文件')
  }
  return { fileName: safeAttachmentFileName(file.originalname), buffer: file.buffer }
}

function mimeFromFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.zip': 'application/zip',
    '.txt': 'text/plain',
  }
  return map[ext] || 'application/octet-stream'
}

@Injectable()
export class DepositRefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BuildingAccessService,
    private readonly bookingDeposit: BookingDepositService,
    private readonly settlements: ContractSettlementsService,
    private readonly refundOrders: RefundOrdersService,
  ) {}

  async findAll(params: {
    keyword?: string
    contractId?: string
    customerId?: string
    roomId?: string
    refundCodes?: string[]
    contractCodes?: string[]
    customerNames?: string[]
    roomNames?: string[]
    totalDeposits?: string[]
    actualRefundAmounts?: string[]
    handlers?: string[]
    createdBys?: string[]
    status?: string
    sortBy?: string
    sortDir?: 'asc' | 'desc'
    terminationDateFrom?: string
    terminationDateTo?: string
    refundDateFrom?: string
    refundDateTo?: string
    createdAtFrom?: string
    createdAtTo?: string
    page?: number
    pageSize?: number
  }): Promise<PaginatedResult<ReturnType<typeof toDepositRefundDto>>> {
    const page = parsePage(params.page)
    const pageSize = parsePageSize(params.pageSize)
    const where = this.buildListWhere(params)
    await this.access.constrain(where, 'viaRoom')
    const { skip, take } = paginateArgs(page, pageSize)

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.depositRefund.count({ where }),
      this.prisma.depositRefund.findMany({
        where,
        include: depositRefundInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...(skip != null ? { skip, take } : {}),
      }),
    ])

    return {
      items: rows.map(toDepositRefundDto),
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    }
  }

  private buildListWhere(params: {
    keyword?: string
    contractId?: string
    customerId?: string
    roomId?: string
    refundCodes?: string[]
    contractCodes?: string[]
    customerNames?: string[]
    roomNames?: string[]
    totalDeposits?: string[]
    actualRefundAmounts?: string[]
    handlers?: string[]
    createdBys?: string[]
    status?: string
    terminationDateFrom?: string
    terminationDateTo?: string
    refundDateFrom?: string
    refundDateTo?: string
    createdAtFrom?: string
    createdAtTo?: string
  }): Prisma.DepositRefundWhereInput {
    const where: Prisma.DepositRefundWhereInput = {}
    if (params.contractId?.trim()) where.contractId = params.contractId.trim()
    if (params.customerId?.trim()) where.customerId = params.customerId.trim()
    if (params.roomId?.trim()) where.roomId = params.roomId.trim()

    const and: Prisma.DepositRefundWhereInput[] = []

    const statusClause = stringFieldInOrEmpty(
      'status',
      splitCsv(params.status) ?? (params.status?.trim() ? [params.status.trim()] : undefined),
    )
    if (statusClause) and.push(statusClause as Prisma.DepositRefundWhereInput)

    const refundCodeClause = stringFieldInOrEmpty('refundCode', params.refundCodes)
    if (refundCodeClause) and.push(refundCodeClause as Prisma.DepositRefundWhereInput)

    const contractCodeClause = stringFieldInOrEmpty('contractCode', params.contractCodes)
    if (contractCodeClause) {
      and.push({ contract: contractCodeClause } as Prisma.DepositRefundWhereInput)
    }

    const customerNameClause = stringFieldInOrEmpty('name', params.customerNames)
    if (customerNameClause) {
      and.push({ customer: customerNameClause } as Prisma.DepositRefundWhereInput)
    }

    const roomNameClause = stringFieldInOrEmpty('name', params.roomNames)
    if (roomNameClause) {
      and.push({ room: roomNameClause } as Prisma.DepositRefundWhereInput)
    }

    const totalDepositClause = numberFieldInOrEmpty('totalDeposit', params.totalDeposits)
    if (totalDepositClause) and.push(totalDepositClause as Prisma.DepositRefundWhereInput)

    const actualRefundClause = numberFieldInOrEmpty(
      'actualRefundAmount',
      params.actualRefundAmounts,
    )
    if (actualRefundClause) and.push(actualRefundClause as Prisma.DepositRefundWhereInput)

    const handlerClause = actorLabelsOrEmpty('handler', params.handlers)
    if (handlerClause) and.push(handlerClause as Prisma.DepositRefundWhereInput)

    const createdByClause = actorLabelsOrEmpty('createdBy', params.createdBys)
    if (createdByClause) and.push(createdByClause as Prisma.DepositRefundWhereInput)

    if (and.length) where.AND = and

    const keyword = params.keyword?.trim()
    if (keyword) {
      where.OR = [
        { refundCode: { contains: keyword, mode: 'insensitive' } },
        { status: { contains: keyword, mode: 'insensitive' } },
        { remark: { contains: keyword, mode: 'insensitive' } },
        { contract: { contractCode: { contains: keyword, mode: 'insensitive' } } },
        { customer: { name: { contains: keyword, mode: 'insensitive' } } },
        { customer: { customerCode: { contains: keyword, mode: 'insensitive' } } },
        { room: { roomCode: { contains: keyword, mode: 'insensitive' } } },
        { room: { name: { contains: keyword, mode: 'insensitive' } } },
      ]
    }

    const termRange = dateRangeFilter(params.terminationDateFrom, params.terminationDateTo)
    if (termRange) where.terminationDate = termRange
    const refundRange = dateRangeFilter(params.refundDateFrom, params.refundDateTo)
    if (refundRange) where.refundDate = refundRange
    const createdRange = dateRangeFilter(params.createdAtFrom, params.createdAtTo)
    if (createdRange) where.createdAt = createdRange

    return where
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.DepositRefundOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'desc'
    const key = (sortBy || '').trim()
    if (key === 'refundCode') return [{ refundCode: dir }]
    if (key === 'contractCode') return [{ contract: { contractCode: dir } }]
    if (key === 'customerName') return [{ customer: { name: dir } }]
    if (key === 'roomName') return [{ room: { name: dir } }]
    if (key === 'status') return [{ status: dir }, { refundCode: 'desc' }]
    if (key === 'terminationDate') return [{ terminationDate: dir }, { refundCode: 'desc' }]
    if (key === 'refundDate') return [{ refundDate: dir }, { refundCode: 'desc' }]
    if (key === 'totalDeposit') return [{ totalDeposit: dir }]
    if (key === 'actualRefundAmount') return [{ actualRefundAmount: dir }]
    if (key === 'handler') return [{ handlerUser: { account: dir } }]
    if (key === 'receivableCount') return [{ receivables: { _count: dir } }]
    if (key === 'createdAt') return [{ createdAt: dir }]
    if (key === 'updatedAt') return [{ updatedAt: dir }]
    if (key === 'createdBy') return [{ createdByUser: { account: dir } }]
    return [{ createdAt: 'desc' }, { refundCode: 'desc' }]
  }

  async findOne(id: string) {
    const row = await this.prisma.depositRefund.findUnique({
      where: { id },
      include: depositRefundInclude,
    })
    if (!row) throw new NotFoundException('Deposit refund not found')
    await this.access.assertRoomId(row.roomId)
    return toDepositRefundDto(row)
  }

  private async resolveContract(dto: {
    contractId?: string
    contractCode?: string
  }) {
    const contractId = s(dto.contractId)
    const contractCode = s(dto.contractCode)
    if (contractId) {
      const row = await this.prisma.contract.findUnique({
        where: { id: contractId },
        select: { id: true, customerId: true, roomId: true },
      })
      if (!row) throw new BadRequestException('Invalid contractId')
      return row
    }
    if (contractCode) {
      const row = await this.prisma.contract.findFirst({
        where: { contractCode },
        select: { id: true, customerId: true, roomId: true },
      })
      if (!row) throw new BadRequestException(`合约编号「${contractCode}」不存在`)
      return row
    }
    throw new BadRequestException('contractId or contractCode is required')
  }

  private async assertHandler(handlerId: string | null) {
    if (!handlerId) return
    const u = await this.prisma.user.findUnique({ where: { id: handlerId }, select: { id: true } })
    if (!u) throw new BadRequestException('Invalid handlerId')
  }

  /**
   * 一并退还定金须覆盖合约全部可用余额（含本单已挂 refund 动账加回），
   * 禁止「只退按金、延后退定金」拆单。
   */
  private async fullBookingRefundAvailable(contractId: string, depositRefundId?: string | null) {
    const account = await this.bookingDeposit.getAccountByContractId(contractId)
    let alreadyOnThis = 0
    if (depositRefundId) {
      const existing = await this.prisma.bookingDepositMovement.findMany({
        where: {
          depositRefundId,
          type: BookingDepositMovementType.refund,
        },
        select: { amount: true },
      })
      alreadyOnThis = existing.reduce((sum, e) => sum + Number(e.amount.toString()), 0)
    }
    return Math.round(Math.max(0, account.balance + alreadyOnThis) * 100) / 100
  }

  async create(dto: CreateDepositRefundDto, actorId?: string | null) {
    const contract = await this.resolveContract(dto)
    const customerId = s(dto.customerId) || contract.customerId
    const roomId = s(dto.roomId) || contract.roomId
    const handlerId = dto.handlerId === undefined ? null : nullId(dto.handlerId)
    await this.assertHandler(handlerId)

    const refundCode = s(dto.refundCode) || (await this.nextRefundCode())
    const bookingFull = await this.fullBookingRefundAvailable(contract.id)
    try {
      const row = await this.prisma.depositRefund.create({
        data: {
          refundCode,
          contractId: contract.id,
          customerId,
          roomId,
          status: s(dto.status),
          terminationDate: parseDateOnly(dto.terminationDate, 'terminationDate'),
          refundDate: parseDateOnly(dto.refundDate, 'refundDate'),
          totalDeposit: decimalField(dto.totalDeposit, 'totalDeposit'),
          refundDueAmount: decimalField(
            dto.refundDueAmount ?? dto.actualRefundAmount,
            'refundDueAmount',
          ),
          actualRefundAmount: decimalField(dto.actualRefundAmount, 'actualRefundAmount'),
          bookingDepositRefundAmount: new Prisma.Decimal(bookingFull),
          handlerId,
          voucherImage: s(dto.voucherImage),
          voucherAttachment: s(dto.voucherAttachment),
          remark: s(dto.remark),
          createdById: actorId || null,
          updatedById: actorId || null,
        },
        include: depositRefundInclude,
      })
      await this.syncBookingDepositForRefundStatus(row, actorId)
      if (s(row.status) === '已退') {
        const roomDepositRefund = Number(row.actualRefundAmount.toString())
        if (roomDepositRefund > 0.009) {
          await allocateRoomDepositRefundToReceivables(
            this.prisma,
            row.contractId,
            roomDepositRefund,
          )
        }
      }
      return toDepositRefundDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`退还编号「${refundCode}」已存在`)
      }
      throw e
    }
  }

  /**
   * 「已退」或「部分已退」且有定金应退时同步定金动账；
   * 定金不拆分，首次已出账即挂全额。其它状态清掉本单已挂的 refund 动账。
   */
  private async syncBookingDepositForRefundStatus(
    row: {
      id: string
      contractId: string
      status: string
      bookingDepositRefundAmount: Prisma.Decimal
      refundDate: Date | null
    },
    actorId?: string | null,
  ) {
    const st = s(row.status)
    const keepBooking = st === '已退' || st === '部分已退'
    const target = keepBooking ? Number(row.bookingDepositRefundAmount.toString()) : 0
    await this.bookingDeposit.syncDepositRefundBookingAmount(
      row.id,
      row.contractId,
      target,
      row.refundDate ? row.refundDate.toISOString().slice(0, 10) : null,
      actorId,
    )
  }

  async update(id: string, dto: UpdateDepositRefundDto, actorId?: string | null) {
    const existing = await this.prisma.depositRefund.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Deposit refund not found')

    let contractId = existing.contractId
    let customerId = existing.customerId
    let roomId = existing.roomId
    if (dto.contractId !== undefined || dto.contractCode !== undefined) {
      const contract = await this.resolveContract(dto)
      contractId = contract.id
      customerId = s(dto.customerId) || contract.customerId
      roomId = s(dto.roomId) || contract.roomId
    } else {
      if (dto.customerId !== undefined) customerId = s(dto.customerId) || existing.customerId
      if (dto.roomId !== undefined) roomId = s(dto.roomId) || existing.roomId
    }

    const refundCode =
      dto.refundCode !== undefined ? s(dto.refundCode) || existing.refundCode : existing.refundCode
    if (!refundCode) throw new BadRequestException('refundCode is required')

    const handlerId =
      dto.handlerId !== undefined ? nullId(dto.handlerId) : existing.handlerId
    await this.assertHandler(handlerId)

    // 按金与定金同退／同延：保存时强制一并退还定金 = 全部可用余额
    const bookingFull = await this.fullBookingRefundAvailable(contractId, id)
    try {
      const row = await this.prisma.depositRefund.update({
        where: { id },
        data: {
          refundCode,
          contractId,
          customerId,
          roomId,
          status: dto.status !== undefined ? s(dto.status) : undefined,
          terminationDate:
            dto.terminationDate !== undefined
              ? parseDateOnly(dto.terminationDate, 'terminationDate')
              : undefined,
          refundDate:
            dto.refundDate !== undefined ? parseDateOnly(dto.refundDate, 'refundDate') : undefined,
          totalDeposit:
            dto.totalDeposit !== undefined
              ? decimalField(dto.totalDeposit, 'totalDeposit')
              : undefined,
          refundDueAmount:
            dto.refundDueAmount !== undefined
              ? decimalField(dto.refundDueAmount, 'refundDueAmount')
              : undefined,
          actualRefundAmount:
            dto.actualRefundAmount !== undefined
              ? decimalField(dto.actualRefundAmount, 'actualRefundAmount')
              : undefined,
          bookingDepositRefundAmount: new Prisma.Decimal(bookingFull),
          handlerId,
          voucherImage: dto.voucherImage !== undefined ? s(dto.voucherImage) : undefined,
          voucherAttachment:
            dto.voucherAttachment !== undefined ? s(dto.voucherAttachment) : undefined,
          remark: dto.remark !== undefined ? s(dto.remark) : undefined,
          updatedById: actorId || null,
        },
        include: depositRefundInclude,
      })
      await this.syncBookingDepositForRefundStatus(row, actorId)
      const becameRefunded =
        s(existing.status) !== '已退' && s(row.status) === '已退'
      if (becameRefunded) {
        const roomDepositRefund = Number(row.actualRefundAmount.toString())
        if (roomDepositRefund > 0.009) {
          await allocateRoomDepositRefundToReceivables(
            this.prisma,
            row.contractId,
            roomDepositRefund,
          )
        }
        await this.syncSettlementOnDepositRefundPaid(row, actorId)
      }
      return toDepositRefundDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`退还编号「${refundCode}」已存在`)
      }
      throw e
    }
  }

  /** 按金退还改为「已退」时：补记退款单出账并结清关联结算 */
  private async syncSettlementOnDepositRefundPaid(
    row: {
      id: string
      contractId: string
      customerId: string
      roomId: string
      handlerId: string | null
      actualRefundAmount: Prisma.Decimal
      bookingDepositRefundAmount: Prisma.Decimal
      refundDate: Date | null
      refundCode: string
    },
    actorId?: string | null,
  ) {
    const settlement = await this.prisma.contractSettlement.findFirst({
      where: { depositRefundId: row.id },
      select: { id: true },
    })
    if (!settlement) return

    const openOrders = await this.prisma.refundOrder.findMany({
      where: {
        settlementId: settlement.id,
        status: {
          notIn: [RefundOrderStatus.paid, RefundOrderStatus.cancelled],
        },
      },
      select: { id: true, amount: true },
    })
    const refundDate = row.refundDate || new Date()
    const handlerId = row.handlerId || actorId || null
    let paidTotal = 0
    if (openOrders.length) {
      for (const o of openOrders) {
        await this.refundOrders.disburse(o.id, {
          refundDate,
          handlerId,
          actorId: actorId || null,
        })
        paidTotal += Number(o.amount.toString())
      }
    } else {
      const amount =
        Math.round(
          (Number(row.actualRefundAmount.toString()) +
            Number(row.bookingDepositRefundAmount.toString())) *
            100,
        ) / 100
      if (amount > 0.009) {
        await this.refundOrders.create({
          contractId: row.contractId,
          customerId: row.customerId,
          roomId: row.roomId,
          settlementId: settlement.id,
          depositRefundId: row.id,
          amount,
          initialPaidAmount: amount,
          refundDate,
          handlerId,
          remark: `按金退还办理已退 ${row.refundCode}`,
          items: [
            {
              itemType: 'room_deposit',
              description: '按金退还',
              amount: Number(row.actualRefundAmount.toString()),
            },
            {
              itemType: 'booking_deposit',
              description: '一并退还定金',
              amount: Number(row.bookingDepositRefundAmount.toString()),
            },
          ].filter((x) => x.amount > 0.009),
          actorId: actorId || null,
        })
        paidTotal = amount
      }
    }
    if (paidTotal > 0.009) {
      await this.settlements.refreshAfterRefund(
        settlement.id,
        paidTotal,
        actorId || null,
      )
    }
  }

  private absPath(storageKey: string) {
    const rel = depositRefundAttachmentStorageRel(storageKey)
    if (!rel || rel.includes('..')) throw new BadRequestException('非法存储路径')
    return path.join(uploadsRoot(), rel)
  }

  private storageKeyForAttachment(depositRefundId: string, fileName: string) {
    const id = s(depositRefundId)
    const base = path.basename(s(fileName))
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      throw new BadRequestException('非法退还单 ID')
    }
    if (!base || base.includes('..') || base.includes('/') || base.includes('\\')) {
      throw new BadRequestException('非法文件名')
    }
    return `deposit-refunds/${id}/${Date.now()}_${base}`
  }

  private async removeStoredAttachmentFile(storageKey: string) {
    if (!storageKey || isExternalDepositRefundAttachmentKey(storageKey)) return
    const rel = depositRefundAttachmentStorageRel(storageKey)
    if (rel.startsWith('attachments/')) return
    await fs.rm(this.absPath(storageKey), { force: true }).catch(() => undefined)
  }

  async uploadAttachments(
    depositRefundId: string,
    files: Express.Multer.File[],
    actor = '',
  ) {
    const row = await this.prisma.depositRefund.findUnique({ where: { id: depositRefundId } })
    if (!row) throw new NotFoundException('Deposit refund not found')
    await this.access.assertRoomId(row.roomId)
    if (!files?.length) throw new BadRequestException('请至少上传一个文件')

    const maxSort = await this.prisma.depositRefundAttachment.aggregate({
      where: { depositRefundId },
      _max: { sortOrder: true },
    })
    let nextSort = (maxSort._max.sortOrder ?? -1) + 1
    const actorId = actor || null
    const created = []

    for (const file of files) {
      const { fileName, buffer } = assertAttachmentFile(file)
      const storageKey = this.storageKeyForAttachment(depositRefundId, fileName)
      const abs = this.absPath(storageKey)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, buffer)
      const att = await this.prisma.depositRefundAttachment.create({
        data: {
          depositRefundId,
          fileName,
          storageKey,
          sortOrder: nextSort++,
          createdById: actorId,
          updatedById: actorId,
        },
      })
      created.push(toDepositRefundAttachmentDto(att))
    }
    return created
  }

  async removeAttachment(depositRefundId: string, attachmentId: string) {
    const att = await this.prisma.depositRefundAttachment.findFirst({
      where: { id: attachmentId, depositRefundId },
    })
    if (!att) throw new NotFoundException('Deposit refund attachment not found')
    const parent = await this.prisma.depositRefund.findUnique({
      where: { id: depositRefundId },
      select: { roomId: true },
    })
    if (!parent) throw new NotFoundException('Deposit refund not found')
    await this.access.assertRoomId(parent.roomId)
    await this.prisma.depositRefundAttachment.delete({ where: { id: attachmentId } })
    await this.removeStoredAttachmentFile(att.storageKey)
    return { success: true }
  }

  async getAttachmentFile(
    depositRefundId: string,
    attachmentId: string,
  ): Promise<StreamableFile> {
    const att = await this.prisma.depositRefundAttachment.findFirst({
      where: { id: attachmentId, depositRefundId },
    })
    if (!att) throw new NotFoundException('Deposit refund attachment not found')
    const parent = await this.prisma.depositRefund.findUnique({
      where: { id: depositRefundId },
      select: { roomId: true },
    })
    if (!parent) throw new NotFoundException('Deposit refund not found')
    await this.access.assertRoomId(parent.roomId)
    if (isExternalDepositRefundAttachmentKey(att.storageKey)) {
      throw new BadRequestException('该附件为外部地址，请直接使用 publicUrl')
    }
    const abs = this.absPath(att.storageKey)
    try {
      await fs.access(abs)
    } catch {
      throw new NotFoundException('附件文件不存在')
    }
    return new StreamableFile(createReadStream(abs), {
      type: mimeFromFileName(att.fileName),
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
    })
  }

  async remove(id: string) {
    const existing = await this.prisma.depositRefund.findUnique({
      where: { id },
      include: { attachments: true },
    })
    if (!existing) throw new NotFoundException('Deposit refund not found')
    await this.access.assertRoomId(existing.roomId)
    try {
      await this.prisma.depositRefund.delete({ where: { id } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Deposit refund not found')
      }
      throw e
    }
    for (const att of existing.attachments) {
      await this.removeStoredAttachmentFile(att.storageKey)
    }
    await fs
      .rm(path.join(uploadsRoot(), 'deposit-refunds', id), { recursive: true, force: true })
      .catch(() => undefined)
    return { success: true }
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id))
  }

  async importBatch(dto: ImportDepositRefundsDto, actorId?: string | null) {
    const items = dto.items || []
    let created = 0
    let skipped = 0
    let failed = 0
    const issues: ImportIssue[] = []

    const codeHints = [...new Set(items.map((it) => s(it.refundCode)).filter(Boolean))]
    const existingCodes = new Set(
      codeHints.length
        ? (
            await this.prisma.depositRefund.findMany({
              where: { refundCode: { in: codeHints } },
              select: { refundCode: true },
            })
          ).map((r) => r.refundCode.toLowerCase())
        : [],
    )

    for (const item of items) {
      const refundCode = s(item.refundCode)
      const contractCode = s(item.contractCode)
      const keys = {
        退還編號: refundCode,
        合約編號: contractCode,
        客戶名稱: '',
        房間名稱: '',
      }
      try {
        if (refundCode && existingCodes.has(refundCode.toLowerCase())) {
          skipped += 1
          pushImportIssue(issues, 'skipped', `退还编号「${refundCode}」已存在`, keys)
          continue
        }
        const row = await this.create(item, actorId)
        existingCodes.add(row.refundCode.toLowerCase())
        created += 1
      } catch (e) {
        failed += 1
        const msg = e instanceof Error ? e.message : String(e)
        pushImportIssue(issues, 'failed', msg, keys)
      }
    }

    return { created, skipped, failed, issues }
  }

  private async nextRefundCode(): Promise<string> {
    const now = new Date()
    const y = String(now.getUTCFullYear()).slice(-2)
    const m = String(now.getUTCMonth() + 1).padStart(2, '0')
    const d = String(now.getUTCDate()).padStart(2, '0')
    const prefix = `DRF${y}${m}${d}`
    const latest = await this.prisma.depositRefund.findFirst({
      where: { refundCode: { startsWith: prefix } },
      orderBy: { refundCode: 'desc' },
      select: { refundCode: true },
    })
    let seq = 1
    if (latest?.refundCode) {
      const n = Number(latest.refundCode.slice(prefix.length))
      if (!Number.isNaN(n)) seq = n + 1
    }
    return `${prefix}${String(seq).padStart(4, '0')}`
  }
}
