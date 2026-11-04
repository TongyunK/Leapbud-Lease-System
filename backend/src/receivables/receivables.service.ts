import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { BuildingAccessService } from '../building-access/building-access.service'
import {
  CreateReceivableDto,
  ImportReceivablesDto,
  UpdateReceivableDto,
} from './dto/receivable.dto'
import {
  receivableDetailInclude,
  receivableInclude,
  toReceivableDto,
} from './receivable.mapper'
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

function amountDupKey(
  invoiceId: string,
  invoiceAmount: Prisma.Decimal,
  receivedAmount: Prisma.Decimal,
  receivableAmount: Prisma.Decimal,
) {
  return `${invoiceId}|${invoiceAmount.toString()}|${receivedAmount.toString()}|${receivableAmount.toString()}`
}

/** Asia/Hong_Kong 今日（YYYY-MM-DD），用于逾期判定 */
function hkTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** 待收款：应收额 > 0（含部分收款、待收款） */
function outstandingWhereClause(): Prisma.ReceivableWhereInput {
  return { receivableAmount: { gt: 0 } }
}

/** 已逾期：收款期限 < 今日，且应收额 > 0 */
function overdueWhereClause(): Prisma.ReceivableWhereInput {
  const today = new Date(`${hkTodayYmd()}T00:00:00.000Z`)
  return {
    paymentDueDate: { lt: today },
    receivableAmount: { gt: 0 },
  }
}

function pushAndClause(where: Prisma.ReceivableWhereInput, clause: Prisma.ReceivableWhereInput) {
  const and = Array.isArray(where.AND) ? [...where.AND] : where.AND ? [where.AND] : []
  and.push(clause)
  where.AND = and
}

@Injectable()
export class ReceivablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BuildingAccessService,
  ) {}

  /** 页头快捷筛选计数（全部 / 待收款 / 已逾期） */
  async countQuickFilters(): Promise<{ all: number; outstanding: number; overdue: number }> {
    const base: Prisma.ReceivableWhereInput = {}
    await this.access.constrain(base, 'viaCustomer')
    const [all, outstanding, overdue] = await this.prisma.$transaction([
      this.prisma.receivable.count({ where: base }),
      this.prisma.receivable.count({
        where: { AND: [base, outstandingWhereClause()] },
      }),
      this.prisma.receivable.count({
        where: { AND: [base, overdueWhereClause()] },
      }),
    ])
    return { all, outstanding, overdue }
  }

  async findAll(params: {
    keyword?: string
    invoiceId?: string
    invoiceCodes?: string[]
    contractId?: string
    contractCodes?: string[]
    customerId?: string
    depositRefundId?: string
    customerNames?: string[]
    invoiceAmounts?: string[]
    receivedAmounts?: string[]
    receivableAmounts?: string[]
    createdBys?: string[]
    sortBy?: string
    sortDir?: 'asc' | 'desc'
    invoiceDateFrom?: string
    invoiceDateTo?: string
    paymentDueDateFrom?: string
    paymentDueDateTo?: string
    createdAtFrom?: string
    createdAtTo?: string
    /** 快捷筛选：待收款（应收额>0） */
    outstanding?: boolean
    /** 快捷筛选：已逾期（超过收款期限且应收额>0）；可与待收款叠加 */
    overdue?: boolean
    page?: number
    pageSize?: number
  }): Promise<PaginatedResult<ReturnType<typeof toReceivableDto>>> {
    const page = parsePage(params.page)
    const pageSize = parsePageSize(params.pageSize)
    const where = this.buildListWhere(params)
    await this.access.constrain(where, 'viaCustomer')
    const { skip, take } = paginateArgs(page, pageSize)

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.receivable.count({ where }),
      this.prisma.receivable.findMany({
        where,
        include: receivableInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...(skip != null ? { skip, take } : {}),
      }),
    ])

    return {
      items: rows.map(toReceivableDto),
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    }
  }

  private buildListWhere(params: {
    keyword?: string
    invoiceId?: string
    invoiceCodes?: string[]
    contractId?: string
    contractCodes?: string[]
    customerId?: string
    depositRefundId?: string
    customerNames?: string[]
    invoiceAmounts?: string[]
    receivedAmounts?: string[]
    receivableAmounts?: string[]
    createdBys?: string[]
    invoiceDateFrom?: string
    invoiceDateTo?: string
    paymentDueDateFrom?: string
    paymentDueDateTo?: string
    createdAtFrom?: string
    createdAtTo?: string
    outstanding?: boolean
    overdue?: boolean
  }): Prisma.ReceivableWhereInput {
    const where: Prisma.ReceivableWhereInput = {}
    if (params.invoiceId?.trim()) where.invoiceId = params.invoiceId.trim()
    if (params.contractId?.trim()) where.contractId = params.contractId.trim()
    if (params.customerId?.trim()) where.customerId = params.customerId.trim()
    if (params.depositRefundId?.trim()) where.depositRefundId = params.depositRefundId.trim()

    const and: Prisma.ReceivableWhereInput[] = []

    const invoiceCodeClause = stringFieldInOrEmpty('invoiceCode', params.invoiceCodes)
    if (invoiceCodeClause) {
      and.push({ invoice: invoiceCodeClause } as Prisma.ReceivableWhereInput)
    }

    const contractCodeClause = stringFieldInOrEmpty('contractCode', params.contractCodes)
    if (contractCodeClause) {
      and.push({ contract: contractCodeClause } as Prisma.ReceivableWhereInput)
    }

    const customerNameClause = stringFieldInOrEmpty('name', params.customerNames)
    if (customerNameClause) {
      and.push({ customer: customerNameClause } as Prisma.ReceivableWhereInput)
    }

    const invoiceAmountClause = numberFieldInOrEmpty('invoiceAmount', params.invoiceAmounts)
    if (invoiceAmountClause) and.push(invoiceAmountClause as Prisma.ReceivableWhereInput)

    const receivedAmountClause = numberFieldInOrEmpty('receivedAmount', params.receivedAmounts)
    if (receivedAmountClause) and.push(receivedAmountClause as Prisma.ReceivableWhereInput)

    const receivableAmountClause = numberFieldInOrEmpty(
      'receivableAmount',
      params.receivableAmounts,
    )
    if (receivableAmountClause) {
      and.push(receivableAmountClause as Prisma.ReceivableWhereInput)
    }

    const createdByClause = actorLabelsOrEmpty('createdBy', params.createdBys)
    if (createdByClause) and.push(createdByClause as Prisma.ReceivableWhereInput)

    if (and.length) {
      const existing = Array.isArray(where.AND)
        ? where.AND
        : where.AND
          ? [where.AND]
          : []
      where.AND = [...existing, ...and]
    }

    const keyword = params.keyword?.trim()
    if (keyword) {
      where.OR = [
        { receivableCode: { contains: keyword, mode: 'insensitive' } },
        { remark: { contains: keyword, mode: 'insensitive' } },
        { relatedReceiptRef: { contains: keyword, mode: 'insensitive' } },
        { invoice: { invoiceCode: { contains: keyword, mode: 'insensitive' } } },
        { contract: { contractCode: { contains: keyword, mode: 'insensitive' } } },
        { customer: { name: { contains: keyword, mode: 'insensitive' } } },
        { customer: { customerCode: { contains: keyword, mode: 'insensitive' } } },
        { depositRefund: { refundCode: { contains: keyword, mode: 'insensitive' } } },
      ]
    }

    const invoiceRange = dateRangeFilter(params.invoiceDateFrom, params.invoiceDateTo)
    if (invoiceRange) where.invoiceDate = invoiceRange
    const dueRange = dateRangeFilter(params.paymentDueDateFrom, params.paymentDueDateTo)
    if (dueRange) where.paymentDueDate = dueRange
    const createdRange = dateRangeFilter(params.createdAtFrom, params.createdAtTo)
    if (createdRange) where.createdAt = createdRange

    if (params.outstanding) pushAndClause(where, outstandingWhereClause())
    if (params.overdue) pushAndClause(where, overdueWhereClause())

    return where
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.ReceivableOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'desc'
    const key = (sortBy || '').trim()
    if (key === 'receivableCode') return [{ receivableCode: dir }]
    if (key === 'invoiceCode') return [{ invoice: { invoiceCode: dir } }]
    if (key === 'contractCode') return [{ contract: { contractCode: dir } }]
    if (key === 'customerName') return [{ customer: { name: dir } }]
    if (key === 'invoiceDate') return [{ invoiceDate: dir }, { receivableCode: 'desc' }]
    if (key === 'paymentDueDate') return [{ paymentDueDate: dir }, { receivableCode: 'desc' }]
    if (key === 'invoiceAmount') return [{ invoiceAmount: dir }]
    if (key === 'receivedAmount') return [{ receivedAmount: dir }]
    if (key === 'receivableAmount') return [{ receivableAmount: dir }]
    if (key === 'depositRefundCode') return [{ depositRefund: { refundCode: dir } }]
    if (key === 'receiptCount') return [{ receipts: { _count: dir } }]
    if (key === 'createdAt') return [{ createdAt: dir }]
    if (key === 'updatedAt') return [{ updatedAt: dir }]
    if (key === 'createdBy') return [{ createdByUser: { account: dir } }]
    return [{ createdAt: 'desc' }, { receivableCode: 'desc' }]
  }

  async findOne(id: string) {
    const row = await this.prisma.receivable.findUnique({
      where: { id },
      include: receivableDetailInclude,
    })
    if (!row) throw new NotFoundException('Receivable not found')
    await this.access.assertCustomerId(row.customerId)
    return toReceivableDto(row)
  }

  /** 同步应收 ↔ 收据一对多：以 receiptIds 为准挂接 / 解绑，并回写 relatedReceiptRef */
  private async syncReceiptIds(
    receivableId: string,
    receiptIds: string[] | undefined,
    actorId?: string | null,
  ) {
    if (receiptIds === undefined) return
    const orderedIds = [
      ...new Set(receiptIds.map((id) => s(id)).filter(Boolean)),
    ]
    if (orderedIds.length) {
      const found = await this.prisma.receipt.findMany({
        where: { id: { in: orderedIds } },
        select: { id: true, receiptCode: true },
      })
      if (found.length !== orderedIds.length) {
        throw new BadRequestException('Invalid receiptIds')
      }
      const codeById = new Map(found.map((r) => [r.id, r.receiptCode]))
      await this.prisma.$transaction([
        this.prisma.receipt.updateMany({
          where: { receivableId, id: { notIn: orderedIds } },
          data: { receivableId: null, updatedById: actorId || null },
        }),
        this.prisma.receipt.updateMany({
          where: { id: { in: orderedIds } },
          data: { receivableId, updatedById: actorId || null },
        }),
        this.prisma.receivable.update({
          where: { id: receivableId },
          data: {
            relatedReceiptRef: orderedIds
              .map((id) => codeById.get(id) || '')
              .filter(Boolean)
              .join(', '),
            updatedById: actorId || null,
          },
        }),
      ])
      return
    }
    await this.prisma.$transaction([
      this.prisma.receipt.updateMany({
        where: { receivableId },
        data: { receivableId: null, updatedById: actorId || null },
      }),
      this.prisma.receivable.update({
        where: { id: receivableId },
        data: { relatedReceiptRef: '', updatedById: actorId || null },
      }),
    ])
  }

  private async resolveInvoice(dto: { invoiceId?: string; invoiceCode?: string }) {
    const invoiceId = s(dto.invoiceId)
    const invoiceCode = s(dto.invoiceCode)
    if (invoiceId) {
      const row = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          invoiceCode: true,
          contractId: true,
          customerId: true,
          invoiceDate: true,
          paymentDueDate: true,
          amount: true,
        },
      })
      if (!row) throw new BadRequestException('Invalid invoiceId')
      return row
    }
    if (invoiceCode) {
      const row = await this.prisma.invoice.findFirst({
        where: { invoiceCode },
        select: {
          id: true,
          invoiceCode: true,
          contractId: true,
          customerId: true,
          invoiceDate: true,
          paymentDueDate: true,
          amount: true,
        },
      })
      if (!row) throw new BadRequestException(`发票编号「${invoiceCode}」不存在`)
      return row
    }
    throw new BadRequestException('invoiceId or invoiceCode is required')
  }

  private async resolveContractOverride(dto: {
    contractId?: string
    contractCode?: string
  }): Promise<{ id: string; customerId: string } | null> {
    const contractId = s(dto.contractId)
    const contractCode = s(dto.contractCode)
    if (!contractId && !contractCode) return null
    if (contractId) {
      const row = await this.prisma.contract.findUnique({
        where: { id: contractId },
        select: { id: true, customerId: true },
      })
      if (!row) throw new BadRequestException('Invalid contractId')
      return row
    }
    const row = await this.prisma.contract.findFirst({
      where: { contractCode },
      select: { id: true, customerId: true },
    })
    if (!row) throw new BadRequestException(`合约编号「${contractCode}」不存在`)
    return row
  }

  private async resolveDepositRefundId(
    depositRefundId?: string | null,
    depositRefundCode?: string | null,
  ): Promise<string | null> {
    const id = nullId(depositRefundId)
    const code = s(depositRefundCode)
    if (id) {
      const row = await this.prisma.depositRefund.findUnique({
        where: { id },
        select: { id: true },
      })
      if (!row) throw new BadRequestException('Invalid depositRefundId')
      return row.id
    }
    if (code) {
      const row = await this.prisma.depositRefund.findFirst({
        where: { refundCode: code },
        select: { id: true },
      })
      if (!row) throw new BadRequestException(`按金退还编号「${code}」不存在`)
      return row.id
    }
    return null
  }

  async create(dto: CreateReceivableDto, actorId?: string | null) {
    const invoice = await this.resolveInvoice(dto)
    const contractOverride = await this.resolveContractOverride(dto)
    const contractId = contractOverride?.id || invoice.contractId
    const customerId =
      s(dto.customerId) || contractOverride?.customerId || invoice.customerId

    const invoiceDate =
      dto.invoiceDate !== undefined
        ? parseDateOnly(dto.invoiceDate, 'invoiceDate')
        : invoice.invoiceDate
    const paymentDueDate =
      dto.paymentDueDate !== undefined
        ? parseDateOnly(dto.paymentDueDate, 'paymentDueDate')
        : invoice.paymentDueDate

    const invoiceAmount =
      dto.invoiceAmount !== undefined
        ? decimalField(dto.invoiceAmount, 'invoiceAmount')
        : new Prisma.Decimal(invoice.amount ?? 0)
    const receivedAmount = decimalField(dto.receivedAmount, 'receivedAmount')
    const receivableAmount =
      dto.receivableAmount !== undefined
        ? decimalField(dto.receivableAmount, 'receivableAmount')
        : new Prisma.Decimal(
            Number(invoiceAmount.toString()) - Number(receivedAmount.toString()),
          )

    const depositRefundId = await this.resolveDepositRefundId(
      dto.depositRefundId,
      dto.depositRefundCode,
    )

    const receivableCode = s(dto.receivableCode) || (await this.nextReceivableCode())
    try {
      const row = await this.prisma.receivable.create({
        data: {
          receivableCode,
          invoiceId: invoice.id,
          contractId,
          customerId,
          invoiceDate,
          paymentDueDate,
          invoiceAmount,
          receivedAmount,
          receivableAmount,
          remark: s(dto.remark),
          relatedReceiptRef: s(dto.relatedReceiptRef),
          depositRefundId,
          createdById: actorId || null,
          updatedById: actorId || null,
        },
        select: { id: true },
      })
      await this.syncReceiptIds(row.id, dto.receiptIds, actorId)
      return this.findOne(row.id)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`应收编号「${receivableCode}」已存在`)
      }
      throw e
    }
  }

  async update(id: string, dto: UpdateReceivableDto, actorId?: string | null) {
    const existing = await this.prisma.receivable.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Receivable not found')

    let invoiceId = existing.invoiceId
    let contractId = existing.contractId
    let customerId = existing.customerId
    let invoiceDate = existing.invoiceDate
    let paymentDueDate = existing.paymentDueDate
    let invoiceAmount = existing.invoiceAmount

    if (dto.invoiceId !== undefined || dto.invoiceCode !== undefined) {
      const invoice = await this.resolveInvoice(dto)
      invoiceId = invoice.id
      contractId = invoice.contractId
      customerId = invoice.customerId
      if (dto.invoiceDate === undefined) invoiceDate = invoice.invoiceDate
      if (dto.paymentDueDate === undefined) paymentDueDate = invoice.paymentDueDate
      if (dto.invoiceAmount === undefined) invoiceAmount = new Prisma.Decimal(invoice.amount ?? 0)
    }

    const contractOverride = await this.resolveContractOverride(dto)
    if (contractOverride) {
      contractId = contractOverride.id
      if (dto.customerId === undefined) customerId = contractOverride.customerId
    }
    if (dto.customerId !== undefined) customerId = s(dto.customerId) || customerId

    if (dto.invoiceDate !== undefined) {
      invoiceDate = parseDateOnly(dto.invoiceDate, 'invoiceDate')
    }
    if (dto.paymentDueDate !== undefined) {
      paymentDueDate = parseDateOnly(dto.paymentDueDate, 'paymentDueDate')
    }
    if (dto.invoiceAmount !== undefined) {
      invoiceAmount = decimalField(dto.invoiceAmount, 'invoiceAmount')
    }

    const receivedAmount =
      dto.receivedAmount !== undefined
        ? decimalField(dto.receivedAmount, 'receivedAmount')
        : existing.receivedAmount
    const receivableAmount =
      dto.receivableAmount !== undefined
        ? decimalField(dto.receivableAmount, 'receivableAmount')
        : dto.invoiceAmount !== undefined || dto.receivedAmount !== undefined
          ? new Prisma.Decimal(
              Number(invoiceAmount.toString()) - Number(receivedAmount.toString()),
            )
          : existing.receivableAmount

    let depositRefundId = existing.depositRefundId
    if (dto.depositRefundId !== undefined || dto.depositRefundCode !== undefined) {
      if (
        dto.depositRefundId === null ||
        (dto.depositRefundId !== undefined && !s(dto.depositRefundId) && !s(dto.depositRefundCode))
      ) {
        depositRefundId = null
      } else {
        depositRefundId = await this.resolveDepositRefundId(
          dto.depositRefundId,
          dto.depositRefundCode,
        )
      }
    }

    const receivableCode =
      dto.receivableCode !== undefined
        ? s(dto.receivableCode) || existing.receivableCode
        : existing.receivableCode
    if (!receivableCode) throw new BadRequestException('receivableCode is required')

    try {
      await this.prisma.receivable.update({
        where: { id },
        data: {
          receivableCode,
          invoiceId,
          contractId,
          customerId,
          invoiceDate,
          paymentDueDate,
          invoiceAmount,
          receivedAmount,
          receivableAmount,
          remark: dto.remark !== undefined ? s(dto.remark) : undefined,
          relatedReceiptRef:
            dto.receiptIds === undefined && dto.relatedReceiptRef !== undefined
              ? s(dto.relatedReceiptRef)
              : undefined,
          depositRefundId,
          updatedById: actorId || null,
        },
      })
      await this.syncReceiptIds(id, dto.receiptIds, actorId)
      return this.findOne(id)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`应收编号「${receivableCode}」已存在`)
      }
      throw e
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.receivable.findUnique({
      where: { id },
      select: { id: true, customerId: true },
    })
    if (!existing) throw new NotFoundException('Receivable not found')
    await this.access.assertCustomerId(existing.customerId)

    try {
      // 下属收据 receivableId 为 SetNull，可直接删应收
      await this.prisma.receivable.delete({ where: { id } })
      return { success: true }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') throw new NotFoundException('Receivable not found')
        if (e.code === 'P2003') {
          throw new ConflictException('无法删除：应收帐仍有关联数据，请先处理关联记录')
        }
      }
      throw e
    }
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id))
  }

  async importBatch(dto: ImportReceivablesDto, actorId?: string | null) {
    const items = dto.items || []
    let created = 0
    let skipped = 0
    let failed = 0
    const issues: ImportIssue[] = []

    const codeHints = [...new Set(items.map((it) => s(it.receivableCode)).filter(Boolean))]
    const existingCodes = new Set(
      codeHints.length
        ? (
            await this.prisma.receivable.findMany({
              where: { receivableCode: { in: codeHints } },
              select: { receivableCode: true },
            })
          ).map((r) => r.receivableCode.toLowerCase())
        : [],
    )

    const invoiceCodes = [...new Set(items.map((it) => s(it.invoiceCode)).filter(Boolean))]
    const invoiceIdHints = [...new Set(items.map((it) => s(it.invoiceId)).filter(Boolean))]
    const invoices =
      invoiceCodes.length || invoiceIdHints.length
        ? await this.prisma.invoice.findMany({
            where: {
              OR: [
                ...(invoiceCodes.length ? [{ invoiceCode: { in: invoiceCodes } }] : []),
                ...(invoiceIdHints.length ? [{ id: { in: invoiceIdHints } }] : []),
              ],
            },
            select: {
              id: true,
              invoiceCode: true,
              amount: true,
            },
          })
        : []
    const invoiceByCode = new Map(
      invoices
        .filter((inv): inv is typeof inv & { invoiceCode: string } => Boolean(inv.invoiceCode))
        .map((inv) => [inv.invoiceCode.toLowerCase(), inv]),
    )
    const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]))

    const existingAmountRows = await this.prisma.receivable.findMany({
      where: {
        invoiceId: { in: invoices.map((inv) => inv.id) },
      },
      select: {
        invoiceId: true,
        invoiceAmount: true,
        receivedAmount: true,
        receivableAmount: true,
      },
    })
    const existingAmountKeys = new Set(
      existingAmountRows.map((r) =>
        amountDupKey(r.invoiceId, r.invoiceAmount, r.receivedAmount, r.receivableAmount),
      ),
    )

    for (const item of items) {
      const receivableCode = s(item.receivableCode)
      const invoiceCode = s(item.invoiceCode)
      const invoiceIdHint = s(item.invoiceId)
      const keys = {
        應收編號: receivableCode,
        發票編號: invoiceCode || invoiceIdHint,
      }
      try {
        if (!invoiceCode && !invoiceIdHint) {
          failed += 1
          pushImportIssue(issues, 'failed', '缺少所属发票（发票编号）', keys)
          continue
        }

        if (receivableCode && existingCodes.has(receivableCode.toLowerCase())) {
          skipped += 1
          pushImportIssue(issues, 'skipped', `应收编号「${receivableCode}」已存在`, keys)
          continue
        }

        const invoice =
          (invoiceIdHint ? invoiceById.get(invoiceIdHint) : null) ||
          (invoiceCode ? invoiceByCode.get(invoiceCode.toLowerCase()) : null)
        if (!invoice) {
          failed += 1
          pushImportIssue(
            issues,
            'failed',
            invoiceCode
              ? `发票编号「${invoiceCode}」不存在`
              : `发票 ID「${invoiceIdHint}」不存在`,
            keys,
          )
          continue
        }

        const invAmt =
          item.invoiceAmount !== undefined
            ? decimalField(item.invoiceAmount, 'invoiceAmount')
            : new Prisma.Decimal(invoice.amount ?? 0)
        const recvAmt = decimalField(item.receivedAmount, 'receivedAmount')
        const arAmt =
          item.receivableAmount !== undefined
            ? decimalField(item.receivableAmount, 'receivableAmount')
            : new Prisma.Decimal(Number(invAmt.toString()) - Number(recvAmt.toString()))
        const dupKey = amountDupKey(invoice.id, invAmt, recvAmt, arAmt)
        if (existingAmountKeys.has(dupKey)) {
          skipped += 1
          pushImportIssue(
            issues,
            'skipped',
            `发票「${invoice.invoiceCode || invoice.id}」已存在相同金额应收记录`,
            { ...keys, 發票編號: invoice.invoiceCode || invoice.id },
          )
          continue
        }

        const row = await this.create(
          {
            ...item,
            invoiceId: invoice.id,
            invoiceCode: invoice.invoiceCode ?? undefined,
            invoiceAmount: Number(invAmt.toString()),
            receivedAmount: Number(recvAmt.toString()),
            receivableAmount: Number(arAmt.toString()),
          },
          actorId,
        )
        existingCodes.add(row.receivableCode.toLowerCase())
        existingAmountKeys.add(dupKey)
        created += 1
      } catch (e) {
        failed += 1
        const msg = e instanceof Error ? e.message : String(e)
        pushImportIssue(issues, 'failed', msg, keys)
      }
    }

    return { created, skipped, failed, issues }
  }

  private async nextReceivableCode(): Promise<string> {
    const now = new Date()
    const y = String(now.getUTCFullYear()).slice(-2)
    const m = String(now.getUTCMonth() + 1).padStart(2, '0')
    const d = String(now.getUTCDate()).padStart(2, '0')
    const prefix = `AR${y}${m}${d}`
    const latest = await this.prisma.receivable.findFirst({
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
}
