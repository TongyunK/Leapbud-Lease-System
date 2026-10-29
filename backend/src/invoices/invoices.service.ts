import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { NumberingBizKey, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { BuildingAccessService } from '../building-access/building-access.service'
import { NumberingRulesService } from '../numbering-rules/numbering-rules.service'
import {
  CreateInvoiceDto,
  ImportInvoicesDto,
  InvoiceServiceDetailDto,
  UpdateInvoiceDto,
} from './dto/invoice.dto'
import { invoiceInclude, toInvoiceDto } from './invoice.mapper'
import {
  dateRangeFilter,
  paginateArgs,
  parsePage,
  parsePageSize,
  parseSortDir,
  type PaginatedResult,
} from '../common/pagination'
import { runBatchRemove } from '../common/batch-delete'
import { pushImportIssue, type ImportIssue } from '../common/import-result'
import {
  dateRangesOverlap,
  invoiceRoomSuffix,
  OCCUPYING_CONTRACT_STATUSES,
} from '../common/room-lease'

function s(v?: string | null) {
  return (v ?? '').trim()
}

/** 合约类型旧值归一；短租等其它原样返回 */
function normalizeInvoiceTypeStored(v?: string | null) {
  const raw = s(v)
  if (raw === '10, Other charges') return 'Others'
  return raw
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

function feeSubtotal(
  quantity: Prisma.Decimal,
  unitAmount: Prisma.Decimal,
  subtotal?: number | null,
): Prisma.Decimal {
  if (subtotal != null && !Number.isNaN(Number(subtotal))) {
    return decimalField(subtotal, 'subtotal')
  }
  return new Prisma.Decimal(Number(quantity.toString()) * Number(unitAmount.toString()))
}

function nullId(v?: string | null): string | null {
  const t = s(v)
  return t || null
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingRules: NumberingRulesService,
    private readonly access: BuildingAccessService,
  ) {}

  /** 当前大厦范围内按来源统计（页头芯片） */
  async countBySource(): Promise<{ all: number; contract: number; short_term: number }> {
    const where: Prisma.InvoiceWhereInput = {}
    await this.access.constrain(where, 'viaRoom')
    const rows = await this.prisma.invoice.groupBy({
      by: ['source'],
      where,
      _count: { _all: true },
    })
    const counts = { all: 0, contract: 0, short_term: 0 }
    for (const row of rows) {
      const n = row._count._all
      counts.all += n
      const src = String(row.source || '').trim()
      if (src === 'short_term') counts.short_term += n
      else counts.contract += n
    }
    return counts
  }

  async findAll(params: {
    keyword?: string
    contractId?: string
    customerId?: string
    roomId?: string
    customerNames?: string[]
    status?: string
    source?: string
    /** manual | auto */
    billingKind?: string
    sortBy?: string
    sortDir?: 'asc' | 'desc'
    invoiceDateFrom?: string
    invoiceDateTo?: string
    paymentDueDateFrom?: string
    paymentDueDateTo?: string
    createdAtFrom?: string
    createdAtTo?: string
    page?: number
    pageSize?: number
  }): Promise<PaginatedResult<ReturnType<typeof toInvoiceDto>>> {
    const page = parsePage(params.page)
    const pageSize = parsePageSize(params.pageSize)
    const where = this.buildListWhere(params)
    await this.access.constrain(where, 'viaRoom')
    const { skip, take } = paginateArgs(page, pageSize)

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: invoiceInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...(skip != null ? { skip, take } : {}),
      }),
    ])

    return {
      items: rows.map(toInvoiceDto),
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
    customerNames?: string[]
    status?: string
    source?: string
    billingKind?: string
    invoiceDateFrom?: string
    invoiceDateTo?: string
    paymentDueDateFrom?: string
    paymentDueDateTo?: string
    createdAtFrom?: string
    createdAtTo?: string
  }): Prisma.InvoiceWhereInput {
    const where: Prisma.InvoiceWhereInput = {}
    if (params.contractId?.trim()) where.contractId = params.contractId.trim()
    if (params.customerId?.trim()) where.customerId = params.customerId.trim()
    if (params.roomId?.trim()) where.roomId = params.roomId.trim()
    if (params.status?.trim()) where.status = params.status.trim()
    const source = s(params.source)
    if (source === 'contract' || source === 'short_term') where.source = source
    const billingKind = s(params.billingKind)
    if (billingKind === 'manual' || billingKind === 'auto') {
      where.billingKind = billingKind
    }
    const customerNames = (params.customerNames || []).map((v) => v.trim()).filter(Boolean)
    if (customerNames.length) {
      where.customer = { name: { in: customerNames } }
    }

    const keyword = params.keyword?.trim()
    if (keyword) {
      where.OR = [
        { invoiceCode: { contains: keyword, mode: 'insensitive' } },
        { invoiceType: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
        { status: { contains: keyword, mode: 'insensitive' } },
        { notes: { contains: keyword, mode: 'insensitive' } },
        { remark: { contains: keyword, mode: 'insensitive' } },
        { roomNameText: { contains: keyword, mode: 'insensitive' } },
        { shortTermRentalCode: { contains: keyword, mode: 'insensitive' } },
        { whatsappNumber: { contains: keyword, mode: 'insensitive' } },
        { relatedReceivableRef: { contains: keyword, mode: 'insensitive' } },
        { contract: { contractCode: { contains: keyword, mode: 'insensitive' } } },
        { customer: { name: { contains: keyword, mode: 'insensitive' } } },
        { customer: { customerCode: { contains: keyword, mode: 'insensitive' } } },
        { room: { roomCode: { contains: keyword, mode: 'insensitive' } } },
        { room: { name: { contains: keyword, mode: 'insensitive' } } },
      ]
    }

    const invoiceRange = dateRangeFilter(params.invoiceDateFrom, params.invoiceDateTo)
    if (invoiceRange) where.invoiceDate = invoiceRange
    const dueRange = dateRangeFilter(params.paymentDueDateFrom, params.paymentDueDateTo)
    if (dueRange) where.paymentDueDate = dueRange
    const createdRange = dateRangeFilter(params.createdAtFrom, params.createdAtTo)
    if (createdRange) where.createdAt = createdRange

    return where
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.InvoiceOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'desc'
    const key = (sortBy || '').trim()
    if (key === 'invoiceCode') return [{ invoiceCode: dir }]
    if (key === 'contractCode') return [{ contract: { contractCode: dir } }]
    if (key === 'customerName') return [{ customer: { name: dir } }]
    if (key === 'roomName') return [{ room: { name: dir } }]
    if (key === 'invoiceType') return [{ invoiceType: dir }, { invoiceCode: 'desc' }]
    if (key === 'source') return [{ source: dir }, { invoiceCode: 'desc' }]
    if (key === 'billingKind') return [{ billingKind: dir }, { invoiceCode: 'desc' }]
    if (key === 'status') return [{ status: dir }, { invoiceCode: 'desc' }]
    if (key === 'amount') return [{ amount: dir }]
    if (key === 'invoiceDate') return [{ invoiceDate: dir }, { invoiceCode: 'desc' }]
    if (key === 'paymentDueDate') return [{ paymentDueDate: dir }, { invoiceCode: 'desc' }]
    if (key === 'salesManager') return [{ salesManagerUser: { account: dir } }]
    if (key === 'receivableCount') return [{ receivables: { _count: dir } }]
    if (key === 'receiptCount') return [{ receipts: { _count: dir } }]
    if (key === 'serviceDetailCount') return [{ serviceDetails: { _count: dir } }]
    if (key === 'createdAt') return [{ createdAt: dir }]
    if (key === 'updatedAt') return [{ updatedAt: dir }]
    if (key === 'createdBy') return [{ createdByUser: { account: dir } }]
    return [{ createdAt: 'desc' }, { invoiceCode: 'desc' }]
  }

  async findOne(id: string) {
    const row = await this.prisma.invoice.findUnique({
      where: { id },
      include: invoiceInclude,
    })
    if (!row) throw new NotFoundException('Invoice not found')
    await this.access.assertRoomId(row.roomId)
    return toInvoiceDto(row)
  }

  private async resolveContract(dto: { contractId?: string; contractCode?: string }) {
    const select = {
      id: true,
      customerId: true,
      roomId: true,
      salesManagerId: true,
      roomNameText: true,
      occupancyMode: true,
      partLabel: true,
      room: { select: { roomCode: true, leaseCapability: true } },
    } as const
    const contractId = s(dto.contractId)
    const contractCode = s(dto.contractCode)
    if (contractId) {
      const row = await this.prisma.contract.findUnique({
        where: { id: contractId },
        select,
      })
      if (!row) throw new BadRequestException('Invalid contractId')
      return row
    }
    if (contractCode) {
      const row = await this.prisma.contract.findFirst({
        where: { contractCode },
        select,
      })
      if (!row) throw new BadRequestException(`合约编号「${contractCode}」不存在`)
      return row
    }
    throw new BadRequestException('contractId or contractCode is required')
  }

  private async assertSalesManager(salesManagerId: string | null) {
    if (!salesManagerId) return
    const u = await this.prisma.user.findUnique({
      where: { id: salesManagerId },
      select: { id: true },
    })
    if (!u) throw new BadRequestException('Invalid salesManagerId')
  }

  private async replaceServiceDetails(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    details: InvoiceServiceDetailDto[] | undefined,
    actorId?: string | null,
  ) {
    if (details === undefined) return

    await tx.invoiceServiceDetail.deleteMany({ where: { invoiceId } })
    if (!details.length) return

    const auditId = actorId || null
    for (let i = 0; i < details.length; i++) {
      const d = details[i]
      const description = s(d.description)
      if (!description) {
        throw new BadRequestException('serviceDetails[].description is required')
      }

      const quantity = decimalField(d.quantity, 'serviceDetails[].quantity')
      const unitAmount = decimalField(d.unitAmount, 'serviceDetails[].unitAmount')
      const subtotal = feeSubtotal(quantity, unitAmount, d.subtotal)

      await tx.invoiceServiceDetail.create({
        data: {
          invoiceId,
          description,
          quantity,
          unitAmount,
          subtotal,
          remark: s(d.remark),
          sortOrder: d.sortOrder != null ? Math.floor(Number(d.sortOrder)) : i,
          createdById: auditId,
          updatedById: auditId,
        },
      })
    }
  }

  private normalizeInvoiceSource(raw?: string | null): 'contract' | 'short_term' {
    return s(raw) === 'short_term' ? 'short_term' : 'contract'
  }

  private async assertCustomerExists(customerId: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    })
    if (!c) throw new BadRequestException('Invalid customerId')
  }

  /** 短租：房间须允许短租，且租期不与占用中合约/其它短租重叠 */
  private async assertShortTermRoomAvailable(opts: {
    roomId: string
    rentalStart: Date
    rentalEnd: Date
    excludeInvoiceId?: string
  }) {
    const room = await this.prisma.room.findUnique({
      where: { id: opts.roomId },
      select: {
        id: true,
        roomCode: true,
        allowShortTerm: true,
        name: true,
        sizeSqft: true,
        leaseCapability: true,
      },
    })
    if (!room) throw new BadRequestException('Invalid roomId')
    if (!room.allowShortTerm) {
      throw new BadRequestException(`房间「${room.roomCode}」未开启允许短租`)
    }
    await this.access.assertRoomId(room.id)

    const occupying = await this.prisma.contract.count({
      where: {
        roomId: room.id,
        status: { in: [...OCCUPYING_CONTRACT_STATUSES] },
      },
    })
    if (occupying > 0) {
      throw new BadRequestException(`房间「${room.roomCode}」已有占用中的合约，无法短租`)
    }

    const others = await this.prisma.invoice.findMany({
      where: {
        roomId: room.id,
        source: 'short_term',
        status: { not: '已取消' },
        rentalStartDate: { not: null },
        rentalEndDate: { not: null },
        ...(opts.excludeInvoiceId ? { id: { not: opts.excludeInvoiceId } } : {}),
      },
      select: {
        invoiceCode: true,
        shortTermRentalCode: true,
        rentalStartDate: true,
        rentalEndDate: true,
      },
    })
    for (const inv of others) {
      if (dateRangesOverlap(opts.rentalStart, opts.rentalEnd, inv.rentalStartDate, inv.rentalEndDate)) {
        const code = inv.shortTermRentalCode || inv.invoiceCode || ''
        throw new BadRequestException(
          code
            ? `该房间短租时段与发票「${code}」重叠`
            : '该房间短租时段与其它短租发票重叠',
        )
      }
    }
    return room
  }

  async create(dto: CreateInvoiceDto, actorId?: string | null) {
    const source = this.normalizeInvoiceSource(dto.source)
    if (source === 'short_term') {
      return this.createShortTerm(dto, actorId)
    }

    const contract = await this.resolveContract(dto)
    const customerId = s(dto.customerId) || contract.customerId
    const roomId = s(dto.roomId) || contract.roomId
    const salesManagerId =
      dto.salesManagerId === undefined
        ? contract.salesManagerId
        : nullId(dto.salesManagerId)
    await this.assertSalesManager(salesManagerId)

    const invoiceCode =
      s(dto.invoiceCode) ||
      (await this.nextInvoiceCode({
        roomCode: contract.room?.roomCode || '',
        leaseCapability: contract.room?.leaseCapability || 'flexible',
        occupancyMode: contract.occupancyMode || 'whole',
        partLabel: contract.partLabel || '',
      }))
    const status = s(dto.status) || '待開票'
    const roomNameText =
      dto.roomNameText !== undefined ? s(dto.roomNameText) : s(contract.roomNameText)

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            invoiceCode,
            source: 'contract',
            contractId: contract.id,
            customerId,
            roomId,
            invoiceType: normalizeInvoiceTypeStored(dto.invoiceType),
            billingKind: 'manual',
            description: s(dto.description),
            amount: decimalField(dto.amount, 'amount'),
            status,
            invoiceDate: parseDateOnly(dto.invoiceDate, 'invoiceDate'),
            paymentDueDate: parseDateOnly(dto.paymentDueDate, 'paymentDueDate'),
            salesManagerId,
            relatedReceivableRef: s(dto.relatedReceivableRef),
            attachment: s(dto.attachment),
            roomNameText,
            notes: s(dto.notes),
            whatsappNumber: s(dto.whatsappNumber),
            shortTermRentalCode: s(dto.shortTermRentalCode),
            remark: s(dto.remark),
            createdById: actorId || null,
            updatedById: actorId || null,
          },
        })
        await this.replaceServiceDetails(tx, created.id, dto.serviceDetails, actorId)
        return tx.invoice.findUniqueOrThrow({
          where: { id: created.id },
          include: invoiceInclude,
        })
      })
      return toInvoiceDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`发票编号「${invoiceCode}」已存在`)
      }
      throw e
    }
  }

  private async createShortTerm(dto: CreateInvoiceDto, actorId?: string | null) {
    const customerId = s(dto.customerId)
    const roomId = s(dto.roomId)
    if (!customerId) throw new BadRequestException('短租发票须选择客户')
    if (!roomId) throw new BadRequestException('短租发票须选择房间')
    await this.assertCustomerExists(customerId)

    const rentalStart = parseDateOnly(dto.rentalStartDate, 'rentalStartDate')
    const rentalEnd = parseDateOnly(dto.rentalEndDate, 'rentalEndDate')
    if (!rentalStart || !rentalEnd) {
      throw new BadRequestException('短租发票须填写租赁开始与结束日期')
    }
    if (rentalStart > rentalEnd) {
      throw new BadRequestException('租赁开始日期不能晚于结束日期')
    }
    if (!s(dto.invoiceDate)) throw new BadRequestException('发票日期必填')
    if (!s(dto.paymentDueDate)) throw new BadRequestException('收款期限必填')

    const referredByCustomerId = nullId(dto.referredByCustomerId)
    if (referredByCustomerId) await this.assertCustomerExists(referredByCustomerId)

    const room = await this.assertShortTermRoomAvailable({
      roomId,
      rentalStart,
      rentalEnd,
    })

    const salesManagerId = nullId(dto.salesManagerId) || actorId || null
    await this.assertSalesManager(salesManagerId)

    const invoiceCode =
      s(dto.invoiceCode) ||
      (await this.nextInvoiceCode({
        roomCode: room.roomCode || '',
        leaseCapability: room.leaseCapability || 'flexible',
        occupancyMode: 'whole',
        partLabel: '',
      }))
    const shortTermRentalCode = s(dto.shortTermRentalCode) || invoiceCode
    const status = s(dto.status) || '已開票'
    const roomNameText =
      dto.roomNameText !== undefined
        ? s(dto.roomNameText)
        : [room.roomCode, room.name].filter(Boolean).join(' · ')

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            invoiceCode,
            source: 'short_term',
            contractId: null,
            customerId,
            roomId,
            invoiceType: s(dto.invoiceType) || '會議室短租',
            billingKind: 'manual',
            description: s(dto.description) || s(dto.rentalDurationText),
            amount: decimalField(dto.amount, 'amount'),
            status,
            invoiceDate: parseDateOnly(dto.invoiceDate, 'invoiceDate'),
            paymentDueDate: parseDateOnly(dto.paymentDueDate, 'paymentDueDate'),
            salesManagerId,
            relatedReceivableRef: s(dto.relatedReceivableRef),
            attachment: s(dto.attachment),
            roomNameText,
            notes: s(dto.notes),
            whatsappNumber: s(dto.whatsappNumber),
            shortTermRentalCode,
            rentalStartDate: rentalStart,
            rentalEndDate: rentalEnd,
            rentalDurationText: s(dto.rentalDurationText),
            referredByCustomerId,
            remark: s(dto.remark),
            createdById: actorId || null,
            updatedById: actorId || null,
          },
        })
        await this.replaceServiceDetails(tx, created.id, dto.serviceDetails, actorId)
        return tx.invoice.findUniqueOrThrow({
          where: { id: created.id },
          include: invoiceInclude,
        })
      })
      return toInvoiceDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`发票编号「${invoiceCode}」已存在`)
      }
      throw e
    }
  }

  async update(id: string, dto: UpdateInvoiceDto, actorId?: string | null) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Invoice not found')

    const source = this.normalizeInvoiceSource(dto.source ?? existing.source)
    let contractId = existing.contractId
    let customerId = existing.customerId
    let roomId = existing.roomId
    let salesManagerId = existing.salesManagerId
    let roomNameText = existing.roomNameText
    let rentalStartDate = existing.rentalStartDate
    let rentalEndDate = existing.rentalEndDate
    let rentalDurationText = existing.rentalDurationText
    let referredByCustomerId = existing.referredByCustomerId
    let shortTermRentalCode = existing.shortTermRentalCode

    if (source === 'short_term') {
      if (dto.customerId !== undefined) {
        customerId = s(dto.customerId) || existing.customerId
        await this.assertCustomerExists(customerId)
      }
      if (dto.roomId !== undefined) {
        roomId = s(dto.roomId) || existing.roomId
      }
      if (dto.rentalStartDate !== undefined) {
        rentalStartDate = parseDateOnly(dto.rentalStartDate, 'rentalStartDate')
      }
      if (dto.rentalEndDate !== undefined) {
        rentalEndDate = parseDateOnly(dto.rentalEndDate, 'rentalEndDate')
      }
      if (!rentalStartDate || !rentalEndDate) {
        throw new BadRequestException('短租发票须填写租赁开始与结束日期')
      }
      if (rentalStartDate > rentalEndDate) {
        throw new BadRequestException('租赁开始日期不能晚于结束日期')
      }
      if (dto.rentalDurationText !== undefined) {
        rentalDurationText = s(dto.rentalDurationText)
      }
      if (dto.referredByCustomerId !== undefined) {
        referredByCustomerId = nullId(dto.referredByCustomerId)
        if (referredByCustomerId) await this.assertCustomerExists(referredByCustomerId)
      }
      if (dto.shortTermRentalCode !== undefined) {
        shortTermRentalCode = s(dto.shortTermRentalCode)
      }
      const nextStatus =
        dto.status !== undefined ? s(dto.status) || existing.status : existing.status
      if (nextStatus !== '已取消') {
        await this.assertShortTermRoomAvailable({
          roomId,
          rentalStart: rentalStartDate,
          rentalEnd: rentalEndDate,
          excludeInvoiceId: id,
        })
      }
      contractId = null
    } else if (dto.contractId !== undefined || dto.contractCode !== undefined) {
      const contract = await this.resolveContract(dto)
      contractId = contract.id
      customerId = s(dto.customerId) || contract.customerId
      roomId = s(dto.roomId) || contract.roomId
      if (dto.salesManagerId === undefined) {
        salesManagerId = contract.salesManagerId
      }
      if (dto.roomNameText === undefined) {
        roomNameText = s(contract.roomNameText) || existing.roomNameText
      }
    } else {
      if (dto.customerId !== undefined) customerId = s(dto.customerId) || existing.customerId
      if (dto.roomId !== undefined) roomId = s(dto.roomId) || existing.roomId
    }

    if (dto.salesManagerId !== undefined) {
      salesManagerId = nullId(dto.salesManagerId)
    }
    await this.assertSalesManager(salesManagerId)

    if (dto.roomNameText !== undefined) {
      roomNameText = s(dto.roomNameText)
    }

    const invoiceCode =
      dto.invoiceCode !== undefined ? s(dto.invoiceCode) || existing.invoiceCode : existing.invoiceCode
    if (!invoiceCode) throw new BadRequestException('invoiceCode is required')

    if (dto.invoiceDate !== undefined && !s(dto.invoiceDate)) {
      throw new BadRequestException('发票日期必填')
    }
    if (dto.paymentDueDate !== undefined && !s(dto.paymentDueDate)) {
      throw new BadRequestException('收款期限必填')
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.invoice.update({
          where: { id },
          data: {
            invoiceCode,
            source,
            contractId,
            customerId,
            roomId,
            invoiceType:
              dto.invoiceType !== undefined ? normalizeInvoiceTypeStored(dto.invoiceType) : undefined,
            description: dto.description !== undefined ? s(dto.description) : undefined,
            amount: dto.amount !== undefined ? decimalField(dto.amount, 'amount') : undefined,
            status: dto.status !== undefined ? s(dto.status) || '待開票' : undefined,
            invoiceDate:
              dto.invoiceDate !== undefined
                ? parseDateOnly(dto.invoiceDate, 'invoiceDate')
                : undefined,
            paymentDueDate:
              dto.paymentDueDate !== undefined
                ? parseDateOnly(dto.paymentDueDate, 'paymentDueDate')
                : undefined,
            salesManagerId,
            relatedReceivableRef:
              dto.relatedReceivableRef !== undefined ? s(dto.relatedReceivableRef) : undefined,
            attachment: dto.attachment !== undefined ? s(dto.attachment) : undefined,
            roomNameText,
            notes: dto.notes !== undefined ? s(dto.notes) : undefined,
            whatsappNumber: dto.whatsappNumber !== undefined ? s(dto.whatsappNumber) : undefined,
            shortTermRentalCode:
              source === 'short_term'
                ? shortTermRentalCode || invoiceCode
                : dto.shortTermRentalCode !== undefined
                  ? s(dto.shortTermRentalCode)
                  : undefined,
            rentalStartDate: source === 'short_term' ? rentalStartDate : undefined,
            rentalEndDate: source === 'short_term' ? rentalEndDate : undefined,
            rentalDurationText:
              source === 'short_term'
                ? rentalDurationText
                : dto.rentalDurationText !== undefined
                  ? s(dto.rentalDurationText)
                  : undefined,
            referredByCustomerId: source === 'short_term' ? referredByCustomerId : undefined,
            remark: dto.remark !== undefined ? s(dto.remark) : undefined,
            updatedById: actorId || null,
          },
        })
        await this.replaceServiceDetails(tx, id, dto.serviceDetails, actorId)
        return tx.invoice.findUniqueOrThrow({
          where: { id },
          include: invoiceInclude,
        })
      })
      return toInvoiceDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`发票编号「${invoiceCode}」已存在`)
      }
      throw e
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, roomId: true },
    })
    if (!existing) throw new NotFoundException('Invoice not found')
    await this.access.assertRoomId(existing.roomId)

    try {
      // Receivable.invoiceId 为 Restrict：须先删下属应收；服务细节 Cascade；收据 invoiceId SetNull
      await this.prisma.$transaction(async (tx) => {
        await tx.receivable.deleteMany({ where: { invoiceId: id } })
        await tx.invoice.delete({ where: { id } })
      })
      return { success: true }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') throw new NotFoundException('Invoice not found')
        if (e.code === 'P2003') {
          throw new ConflictException('无法删除：发票仍有关联数据，请先处理关联记录')
        }
      }
      throw e
    }
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id))
  }

  async importBatch(dto: ImportInvoicesDto, actorId?: string | null) {
    const items = dto.items || []
    let created = 0
    let skipped = 0
    let failed = 0
    const issues: ImportIssue[] = []

    const codeHints = [...new Set(items.map((it) => s(it.invoiceCode)).filter(Boolean))]
    const existingCodes = new Set(
      codeHints.length
        ? (
            await this.prisma.invoice.findMany({
              where: { invoiceCode: { in: codeHints } },
              select: { invoiceCode: true },
            })
          ).flatMap((r) => (r.invoiceCode ? [r.invoiceCode.toLowerCase()] : []))
        : [],
    )

    for (const item of items) {
      const invoiceCode = s(item.invoiceCode)
      const contractCode = s(item.contractCode)
      const keys = {
        發票編號: invoiceCode,
        合約編號: contractCode,
        客戶名稱: '',
        房間名稱: '',
      }
      try {
        if (invoiceCode && existingCodes.has(invoiceCode.toLowerCase())) {
          skipped += 1
          pushImportIssue(issues, 'skipped', `发票编号「${invoiceCode}」已存在`, keys)
          continue
        }
        const row = await this.create(item, actorId)
        if (row.invoiceCode) existingCodes.add(row.invoiceCode.toLowerCase())
        created += 1
      } catch (e) {
        failed += 1
        const msg = e instanceof Error ? e.message : String(e)
        pushImportIssue(issues, 'failed', msg, keys)
      }
    }

    return { created, skipped, failed, issues }
  }

  /** 预览下一个发票编号（不占用序号；保存时仍重新分配）。可选 contractId 以带上房间后缀。 */
  async previewInvoiceCode(contractId?: string) {
    const id = s(contractId)
    if (id) {
      const contract = await this.resolveContract({ contractId: id })
      const code = await this.buildInvoiceCode(
        {
          roomCode: contract.room?.roomCode || '',
          leaseCapability: contract.room?.leaseCapability || 'flexible',
          occupancyMode: contract.occupancyMode || 'whole',
          partLabel: contract.partLabel || '',
        },
        false,
      )
      return { code }
    }
    const code = await this.buildInvoiceCode(
      { roomCode: '', leaseCapability: 'flexible', occupancyMode: 'whole', partLabel: '' },
      false,
    )
    return { code }
  }

  private async nextInvoiceCode(roomRef: {
    roomCode: string
    leaseCapability: string
    occupancyMode: string
    partLabel: string
  }): Promise<string> {
    return this.buildInvoiceCode(roomRef, true)
  }

  private async buildInvoiceCode(
    roomRef: {
      roomCode: string
      leaseCapability: string
      occupancyMode: string
      partLabel: string
    },
    consume: boolean,
  ): Promise<string> {
    const suffix = invoiceRoomSuffix(roomRef)
    const allocate = consume
      ? this.numberingRules.nextCode.bind(this.numberingRules)
      : this.numberingRules.previewCode.bind(this.numberingRules)
    const auto = await allocate(NumberingBizKey.invoice, {
      isTaken: async (code) => {
        const full = suffix ? `${code}-${suffix}` : code
        if (suffix) {
          return !!(await this.prisma.invoice.findFirst({
            where: { invoiceCode: full },
            select: { id: true },
          }))
        }
        // 尚无房间后缀时：占用检测覆盖裸号及「号-后缀」形式
        return !!(await this.prisma.invoice.findFirst({
          where: {
            OR: [{ invoiceCode: full }, { invoiceCode: { startsWith: `${full}-` } }],
          },
          select: { id: true },
        }))
      },
    })
    return suffix ? `${auto}-${suffix}` : auto
  }
}
