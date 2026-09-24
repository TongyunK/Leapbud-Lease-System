import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
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
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    keyword?: string
    contractId?: string
    customerId?: string
    roomId?: string
    customerNames?: string[]
    status?: string
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
    return toInvoiceDto(row)
  }

  private async resolveContract(dto: { contractId?: string; contractCode?: string }) {
    const contractId = s(dto.contractId)
    const contractCode = s(dto.contractCode)
    if (contractId) {
      const row = await this.prisma.contract.findUnique({
        where: { id: contractId },
        select: {
          id: true,
          customerId: true,
          roomId: true,
          salesManagerId: true,
          roomNameText: true,
        },
      })
      if (!row) throw new BadRequestException('Invalid contractId')
      return row
    }
    if (contractCode) {
      const row = await this.prisma.contract.findFirst({
        where: { contractCode },
        select: {
          id: true,
          customerId: true,
          roomId: true,
          salesManagerId: true,
          roomNameText: true,
        },
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

  async create(dto: CreateInvoiceDto, actorId?: string | null) {
    const contract = await this.resolveContract(dto)
    const customerId = s(dto.customerId) || contract.customerId
    const roomId = s(dto.roomId) || contract.roomId
    const salesManagerId =
      dto.salesManagerId === undefined
        ? contract.salesManagerId
        : nullId(dto.salesManagerId)
    await this.assertSalesManager(salesManagerId)

    const invoiceCode = s(dto.invoiceCode) || (await this.nextInvoiceCode())
    const status = s(dto.status) || '待開票'
    const roomNameText =
      dto.roomNameText !== undefined ? s(dto.roomNameText) : s(contract.roomNameText)

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            invoiceCode,
            contractId: contract.id,
            customerId,
            roomId,
            invoiceType: s(dto.invoiceType),
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

  async update(id: string, dto: UpdateInvoiceDto, actorId?: string | null) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Invoice not found')

    let contractId = existing.contractId
    let customerId = existing.customerId
    let roomId = existing.roomId
    let salesManagerId = existing.salesManagerId
    let roomNameText = existing.roomNameText

    if (dto.contractId !== undefined || dto.contractCode !== undefined) {
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

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.invoice.update({
          where: { id },
          data: {
            invoiceCode,
            contractId,
            customerId,
            roomId,
            invoiceType: dto.invoiceType !== undefined ? s(dto.invoiceType) : undefined,
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
              dto.shortTermRentalCode !== undefined ? s(dto.shortTermRentalCode) : undefined,
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
    try {
      await this.prisma.invoice.delete({ where: { id } })
      return { success: true }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Invoice not found')
      }
      throw e
    }
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, async (id) => {
      await this.prisma.invoice.delete({ where: { id } })
    })
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

  private async nextInvoiceCode(): Promise<string> {
    const now = new Date()
    const y = String(now.getUTCFullYear()).slice(-2)
    const m = String(now.getUTCMonth() + 1).padStart(2, '0')
    const d = String(now.getUTCDate()).padStart(2, '0')
    const prefix = `INV${y}${m}${d}`
    const latest = await this.prisma.invoice.findFirst({
      where: { invoiceCode: { startsWith: prefix } },
      orderBy: { invoiceCode: 'desc' },
      select: { invoiceCode: true },
    })
    let seq = 1
    if (latest?.invoiceCode) {
      const n = Number(latest.invoiceCode.slice(prefix.length))
      if (!Number.isNaN(n)) seq = n + 1
    }
    return `${prefix}${String(seq).padStart(4, '0')}`
  }
}
