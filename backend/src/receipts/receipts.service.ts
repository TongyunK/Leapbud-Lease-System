import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { NumberingBizKey, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { NumberingRulesService } from '../numbering-rules/numbering-rules.service'
import { CreateReceiptDto, ImportReceiptsDto, UpdateReceiptDto } from './dto/receipt.dto'
import { receiptInclude, toReceiptDto } from './receipt.mapper'
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

function nullId(v?: string | null): string | null {
  const t = s(v)
  return t || null
}

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingRules: NumberingRulesService,
  ) {}

  async findAll(params: {
    keyword?: string
    customerId?: string
    customerNames?: string[]
    paymentMethods?: string[]
    contractCodes?: string[]
    invoiceCodes?: string[]
    receivableCodes?: string[]
    contractId?: string
    invoiceId?: string
    receivableId?: string
    sortBy?: string
    sortDir?: 'asc' | 'desc'
    paymentDateFrom?: string
    paymentDateTo?: string
    createdAtFrom?: string
    createdAtTo?: string
    page?: number
    pageSize?: number
  }): Promise<PaginatedResult<ReturnType<typeof toReceiptDto>>> {
    const page = parsePage(params.page)
    const pageSize = parsePageSize(params.pageSize)
    const where = this.buildListWhere(params)
    const { skip, take } = paginateArgs(page, pageSize)

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.receipt.count({ where }),
      this.prisma.receipt.findMany({
        where,
        include: receiptInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...(skip != null ? { skip, take } : {}),
      }),
    ])

    return {
      items: rows.map(toReceiptDto),
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    }
  }

  private buildListWhere(params: {
    keyword?: string
    customerId?: string
    customerNames?: string[]
    paymentMethods?: string[]
    contractCodes?: string[]
    invoiceCodes?: string[]
    receivableCodes?: string[]
    contractId?: string
    invoiceId?: string
    receivableId?: string
    paymentDateFrom?: string
    paymentDateTo?: string
    createdAtFrom?: string
    createdAtTo?: string
  }): Prisma.ReceiptWhereInput {
    const where: Prisma.ReceiptWhereInput = {}
    const and: Prisma.ReceiptWhereInput[] = []

    if (params.customerId?.trim()) where.customerId = params.customerId.trim()
    if (params.contractId?.trim()) where.contractId = params.contractId.trim()
    if (params.invoiceId?.trim()) where.invoiceId = params.invoiceId.trim()
    if (params.receivableId?.trim()) where.receivableId = params.receivableId.trim()

    const customerNames = (params.customerNames || []).map((v) => s(v)).filter(Boolean)
    if (customerNames.length) {
      and.push({ customer: { name: { in: customerNames } } })
    }

    const paymentMethods = (params.paymentMethods || []).map((v) => s(v)).filter(Boolean)
    if (paymentMethods.length) {
      and.push({ paymentMethod: { in: paymentMethods } })
    }

    const contractCodes = (params.contractCodes || []).map((v) => s(v)).filter(Boolean)
    if (contractCodes.length) {
      and.push({ contract: { contractCode: { in: contractCodes } } })
    }

    const invoiceCodes = (params.invoiceCodes || []).map((v) => s(v)).filter(Boolean)
    if (invoiceCodes.length) {
      and.push({ invoice: { invoiceCode: { in: invoiceCodes } } })
    }

    const receivableCodes = (params.receivableCodes || []).map((v) => s(v)).filter(Boolean)
    if (receivableCodes.length) {
      and.push({ receivable: { receivableCode: { in: receivableCodes } } })
    }

    const keyword = params.keyword?.trim()
    if (keyword) {
      and.push({
        OR: [
          { receiptCode: { contains: keyword, mode: 'insensitive' } },
          { paymentMethod: { contains: keyword, mode: 'insensitive' } },
          { remark: { contains: keyword, mode: 'insensitive' } },
          { voucher1: { contains: keyword, mode: 'insensitive' } },
          { voucher2: { contains: keyword, mode: 'insensitive' } },
          { changeLog: { contains: keyword, mode: 'insensitive' } },
          { customer: { name: { contains: keyword, mode: 'insensitive' } } },
          { customer: { customerCode: { contains: keyword, mode: 'insensitive' } } },
          { contract: { contractCode: { contains: keyword, mode: 'insensitive' } } },
          { invoice: { invoiceCode: { contains: keyword, mode: 'insensitive' } } },
          { receivable: { receivableCode: { contains: keyword, mode: 'insensitive' } } },
        ],
      })
    }

    const paymentRange = dateRangeFilter(params.paymentDateFrom, params.paymentDateTo)
    if (paymentRange) where.paymentDate = paymentRange
    const createdRange = dateRangeFilter(params.createdAtFrom, params.createdAtTo)
    if (createdRange) where.createdAt = createdRange

    if (and.length) where.AND = and
    return where
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.ReceiptOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'desc'
    const key = (sortBy || '').trim()
    if (key === 'receiptCode') return [{ receiptCode: dir }]
    if (key === 'customerName') return [{ customer: { name: dir } }]
    if (key === 'contractCode') return [{ contract: { contractCode: dir } }]
    if (key === 'invoiceCode') return [{ invoice: { invoiceCode: dir } }]
    if (key === 'receivableCode') return [{ receivable: { receivableCode: dir } }]
    if (key === 'paymentDate') return [{ paymentDate: dir }, { receiptCode: 'desc' }]
    if (key === 'paymentMethod') return [{ paymentMethod: dir }, { receiptCode: 'desc' }]
    if (key === 'amount') return [{ amount: dir }]
    if (key === 'remark') return [{ remark: dir }]
    if (key === 'voucher1') return [{ voucher1: dir }]
    if (key === 'voucher2') return [{ voucher2: dir }]
    if (key === 'changeLog') return [{ changeLog: dir }]
    if (key === 'createdAt') return [{ createdAt: dir }]
    if (key === 'updatedAt') return [{ updatedAt: dir }]
    if (key === 'createdBy') return [{ createdByUser: { account: dir } }]
    return [{ createdAt: 'desc' }, { receiptCode: 'desc' }]
  }

  async findOne(id: string) {
    const row = await this.prisma.receipt.findUnique({
      where: { id },
      include: receiptInclude,
    })
    if (!row) throw new NotFoundException('Receipt not found')
    return toReceiptDto(row)
  }

  private async resolveReceivable(dto: {
    receivableId?: string | null
    receivableCode?: string
  }): Promise<{
    id: string
    customerId: string
    contractId: string | null
    invoiceId: string | null
  } | null> {
    const id = nullId(dto.receivableId)
    const code = s(dto.receivableCode)
    if (!id && !code) return null
    if (id) {
      const row = await this.prisma.receivable.findUnique({
        where: { id },
        select: { id: true, customerId: true, contractId: true, invoiceId: true },
      })
      if (!row) throw new BadRequestException('Invalid receivableId')
      return row
    }
    const byCode = await this.prisma.receivable.findFirst({
      where: { receivableCode: code },
      select: { id: true, customerId: true, contractId: true, invoiceId: true },
    })
    if (byCode) return byCode

    // 兼容旧系统：所属应收列常填发票编号（如 W262629-3SPi03）
    const viaInvoiceCode = await this.prisma.receivable.findFirst({
      where: { invoice: { invoiceCode: code } },
      select: { id: true, customerId: true, contractId: true, invoiceId: true },
    })
    if (viaInvoiceCode) return viaInvoiceCode

    return null
  }

  private async resolveInvoice(dto: {
    invoiceId?: string | null
    invoiceCode?: string
  }): Promise<{ id: string; customerId: string; contractId: string | null } | null> {
    const id = nullId(dto.invoiceId)
    const code = s(dto.invoiceCode)
    if (!id && !code) return null
    if (id) {
      const row = await this.prisma.invoice.findUnique({
        where: { id },
        select: { id: true, customerId: true, contractId: true },
      })
      if (!row) throw new BadRequestException('Invalid invoiceId')
      return row
    }
    const row = await this.prisma.invoice.findFirst({
      where: { invoiceCode: code },
      select: { id: true, customerId: true, contractId: true },
    })
    if (!row) throw new BadRequestException(`发票编号「${code}」不存在`)
    return row
  }

  private async resolveContract(dto: {
    contractId?: string | null
    contractCode?: string
  }): Promise<{ id: string; customerId: string } | null> {
    const id = nullId(dto.contractId)
    const code = s(dto.contractCode)
    if (!id && !code) return null
    if (id) {
      const row = await this.prisma.contract.findUnique({
        where: { id },
        select: { id: true, customerId: true },
      })
      if (!row) throw new BadRequestException('Invalid contractId')
      return row
    }
    const row = await this.prisma.contract.findFirst({
      where: { contractCode: code },
      select: { id: true, customerId: true },
    })
    if (!row) throw new BadRequestException(`合约编号「${code}」不存在`)
    return row
  }

  private async resolveCustomer(dto: {
    customerId?: string
    customerCode?: string
    customerName?: string
  }): Promise<string | null> {
    const customerId = s(dto.customerId)
    if (customerId) {
      const row = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      })
      if (!row) throw new BadRequestException('Invalid customerId')
      return row.id
    }
    const customerCode = s(dto.customerCode)
    if (customerCode) {
      const row = await this.prisma.customer.findFirst({
        where: { customerCode },
        select: { id: true },
      })
      if (!row) throw new BadRequestException(`客户编号「${customerCode}」不存在`)
      return row.id
    }
    const customerName = s(dto.customerName)
    if (customerName) {
      const rows = await this.prisma.customer.findMany({
        where: { name: customerName },
        select: { id: true },
        take: 2,
      })
      if (rows.length === 0) throw new BadRequestException(`客户名称「${customerName}」不存在`)
      if (rows.length > 1) {
        throw new BadRequestException(`客户名称「${customerName}」不唯一，请使用客户编号`)
      }
      return rows[0].id
    }
    return null
  }

  private async resolveLinks(dto: {
    customerId?: string
    customerCode?: string
    customerName?: string
    contractId?: string | null
    contractCode?: string
    invoiceId?: string | null
    invoiceCode?: string
    receivableId?: string | null
    receivableCode?: string
  }) {
    const receivableHint = s(dto.receivableCode)
    const receivable = await this.resolveReceivable(dto)
    let invoice = await this.resolveInvoice(dto)
    let contract = await this.resolveContract(dto)

    // 旧表「所属应收」常写发票编号：应收未命中时按发票编号再解析
    if (!receivable && !invoice && receivableHint && !s(dto.invoiceCode) && !nullId(dto.invoiceId)) {
      try {
        invoice = await this.resolveInvoice({ invoiceCode: receivableHint })
      } catch {
        throw new BadRequestException(
          `无法解析所属应收/发票「${receivableHint}」（既不是应收编号，也不是已存在的发票编号）`,
        )
      }
    } else if (receivableHint && !receivable && !invoice) {
      throw new BadRequestException(`应收编号「${receivableHint}」不存在`)
    }

    // 有发票但无应收时：尝试挂上该发票下的应收
    let resolvedReceivable = receivable
    if (!resolvedReceivable && invoice) {
      resolvedReceivable = await this.prisma.receivable.findFirst({
        where: { invoiceId: invoice.id },
        select: { id: true, customerId: true, contractId: true, invoiceId: true },
        orderBy: { createdAt: 'asc' },
      })
    }

    // 选应收时：补齐客户 / 合约 / 发票（若尚未指定）
    if (resolvedReceivable) {
      if (!invoice && resolvedReceivable.invoiceId) {
        invoice = await this.resolveInvoice({ invoiceId: resolvedReceivable.invoiceId })
      }
      if (!contract && resolvedReceivable.contractId) {
        contract = await this.resolveContract({ contractId: resolvedReceivable.contractId })
      }
    }
    // 选发票时：补齐客户 / 合约
    if (invoice && !contract && invoice.contractId) {
      contract = await this.resolveContract({ contractId: invoice.contractId })
    }

    let customerId = await this.resolveCustomer(dto)
    if (!customerId && resolvedReceivable) customerId = resolvedReceivable.customerId
    if (!customerId && invoice) customerId = invoice.customerId
    if (!customerId && contract) customerId = contract.customerId
    if (!customerId) {
      throw new BadRequestException('customerId or customerCode/customerName is required')
    }

    return {
      customerId,
      contractId: contract?.id ?? nullId(dto.contractId),
      invoiceId: invoice?.id ?? nullId(dto.invoiceId),
      receivableId: resolvedReceivable?.id ?? nullId(dto.receivableId),
    }
  }

  async create(dto: CreateReceiptDto, actorId?: string | null) {
    const links = await this.resolveLinks(dto)
    const receiptCode = s(dto.receiptCode) || (await this.nextReceiptCode())

    try {
      const row = await this.prisma.receipt.create({
        data: {
          receiptCode,
          customerId: links.customerId,
          contractId: links.contractId,
          invoiceId: links.invoiceId,
          receivableId: links.receivableId,
          paymentDate: parseDateOnly(dto.paymentDate, 'paymentDate'),
          paymentMethod: s(dto.paymentMethod),
          amount: decimalField(dto.amount, 'amount'),
          remark: s(dto.remark),
          voucher1: s(dto.voucher1),
          voucher2: s(dto.voucher2),
          changeLog: s(dto.changeLog),
          createdById: actorId || null,
          updatedById: actorId || null,
        },
        include: receiptInclude,
      })
      return toReceiptDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`收据编号「${receiptCode}」已存在`)
      }
      throw e
    }
  }

  async update(id: string, dto: UpdateReceiptDto, actorId?: string | null) {
    const existing = await this.prisma.receipt.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Receipt not found')

    const touchReceivable =
      dto.receivableId !== undefined || dto.receivableCode !== undefined
    const touchInvoice = dto.invoiceId !== undefined || dto.invoiceCode !== undefined
    const touchContract = dto.contractId !== undefined || dto.contractCode !== undefined
    const touchCustomer =
      dto.customerId !== undefined ||
      dto.customerCode !== undefined ||
      dto.customerName !== undefined

    let customerId = existing.customerId
    let contractId = existing.contractId
    let invoiceId = existing.invoiceId
    let receivableId = existing.receivableId

    if (touchReceivable || touchInvoice || touchContract || touchCustomer) {
      const links = await this.resolveLinks({
        customerId: touchCustomer ? dto.customerId : existing.customerId,
        customerCode: dto.customerCode,
        customerName: dto.customerName,
        contractId: touchContract
          ? dto.contractId === null
            ? ''
            : dto.contractId ?? undefined
          : existing.contractId,
        contractCode: dto.contractCode,
        invoiceId: touchInvoice
          ? dto.invoiceId === null
            ? ''
            : dto.invoiceId ?? undefined
          : existing.invoiceId,
        invoiceCode: dto.invoiceCode,
        receivableId: touchReceivable
          ? dto.receivableId === null
            ? ''
            : dto.receivableId ?? undefined
          : existing.receivableId,
        receivableCode: dto.receivableCode,
      })
      customerId = links.customerId
      contractId = links.contractId
      invoiceId = links.invoiceId
      receivableId = links.receivableId

      if (touchReceivable && dto.receivableId === null && !s(dto.receivableCode)) {
        receivableId = null
      }
      if (touchInvoice && dto.invoiceId === null && !s(dto.invoiceCode)) {
        invoiceId = null
      }
      if (touchContract && dto.contractId === null && !s(dto.contractCode)) {
        contractId = null
      }
    }

    const receiptCode =
      dto.receiptCode !== undefined ? s(dto.receiptCode) || existing.receiptCode : existing.receiptCode
    if (!receiptCode) throw new BadRequestException('receiptCode is required')

    try {
      const row = await this.prisma.receipt.update({
        where: { id },
        data: {
          receiptCode,
          customerId,
          contractId,
          invoiceId,
          receivableId,
          paymentDate:
            dto.paymentDate !== undefined
              ? parseDateOnly(dto.paymentDate, 'paymentDate')
              : undefined,
          paymentMethod: dto.paymentMethod !== undefined ? s(dto.paymentMethod) : undefined,
          amount: dto.amount !== undefined ? decimalField(dto.amount, 'amount') : undefined,
          remark: dto.remark !== undefined ? s(dto.remark) : undefined,
          voucher1: dto.voucher1 !== undefined ? s(dto.voucher1) : undefined,
          voucher2: dto.voucher2 !== undefined ? s(dto.voucher2) : undefined,
          changeLog: dto.changeLog !== undefined ? s(dto.changeLog) : undefined,
          updatedById: actorId || null,
        },
        include: receiptInclude,
      })
      return toReceiptDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`收据编号「${receiptCode}」已存在`)
      }
      throw e
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.receipt.delete({ where: { id } })
      return { success: true }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Receipt not found')
      }
      throw e
    }
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, async (id) => {
      await this.prisma.receipt.delete({ where: { id } })
    })
  }

  async importBatch(dto: ImportReceiptsDto, actorId?: string | null) {
    const items = dto.items || []
    let created = 0
    let skipped = 0
    let failed = 0
    const issues: ImportIssue[] = []

    const codeHints = [...new Set(items.map((it) => s(it.receiptCode)).filter(Boolean))]
    const existingCodes = new Set(
      codeHints.length
        ? (
            await this.prisma.receipt.findMany({
              where: { receiptCode: { in: codeHints } },
              select: { receiptCode: true },
            })
          ).map((r) => r.receiptCode.toLowerCase())
        : [],
    )

    for (const item of items) {
      const receiptCode = s(item.receiptCode)
      const customerCode = s(item.customerCode)
      const customerName = s(item.customerName)
      const keys = {
        收據編號: receiptCode,
        客戶編號: customerCode,
        客戶名稱: customerName,
        發票編號: s(item.invoiceCode),
        應收編號: s(item.receivableCode),
      }
      try {
        if (receiptCode && existingCodes.has(receiptCode.toLowerCase())) {
          skipped += 1
          pushImportIssue(issues, 'skipped', `收据编号「${receiptCode}」已存在`, keys)
          continue
        }
        const row = await this.create(item, actorId)
        existingCodes.add(row.receiptCode.toLowerCase())
        created += 1
      } catch (e) {
        failed += 1
        const msg = e instanceof Error ? e.message : String(e)
        pushImportIssue(issues, 'failed', msg, keys)
      }
    }

    return { created, skipped, failed, issues }
  }

  private async nextReceiptCode(): Promise<string> {
    return this.numberingRules.nextCode(NumberingBizKey.receipt, {
      isTaken: async (code) =>
        !!(await this.prisma.receipt.findFirst({
          where: { receiptCode: code },
          select: { id: true },
        })),
    })
  }
}
