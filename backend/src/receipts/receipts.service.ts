import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common'
import { NumberingBizKey, Prisma, ReceiptKind } from '@prisma/client'
import { createReadStream } from 'fs'
import { promises as fs } from 'fs'
import * as path from 'path'
import { PrismaService } from '../prisma/prisma.service'
import { BuildingAccessService } from '../building-access/building-access.service'
import { NumberingRulesService } from '../numbering-rules/numbering-rules.service'
import { CashFlowsService } from '../contract-settlements/cash-flows.service'
import { CreateReceiptDto, ImportReceiptsDto, UpdateReceiptDto } from './dto/receipt.dto'
import {
  isExternalReceiptAttachmentKey,
  receiptAttachmentStorageRel,
  receiptInclude,
  toReceiptAttachmentDto,
  toReceiptDto,
} from './receipt.mapper'
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
import {
  syncReceivableReceivedAmount,
  syncReceivableReceivedAmounts,
} from './receivable-received.sync'

/** 开单生成定金收据时所需的合约字段 */
export type BookingDepositContractSource = {
  id: string
  customerId: string
  bookingDeposit: Prisma.Decimal | number | null
  paymentDate: Date | null
  paymentMethod: string
  paymentVoucher: string
  bookingDepositReceiptId?: string | null
}

function uploadsRoot() {
  return path.join(process.cwd(), 'uploads')
}

/** multer 文件名 UTF-8 修复 */
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
  const fileName = safeAttachmentFileName(file.originalname)
  return { fileName, buffer: file.buffer }
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
    '.svg': 'image/svg+xml',
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

function fileNameFromStorageKey(storageKey: string): string {
  const base = path.basename(receiptAttachmentStorageRel(storageKey) || storageKey)
  return (
    base.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '') ||
    base ||
    'voucher'
  )
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
    private readonly access: BuildingAccessService,
    private readonly cashFlows: CashFlowsService,
  ) {}

  /** 页头快捷筛选计数：全部 / 发票收据 / 定金收据 */
  async countByKind(): Promise<{
    all: number
    invoice: number
    booking_deposit: number
  }> {
    const base: Prisma.ReceiptWhereInput = {}
    await this.access.constrain(base, 'viaCustomer')

    const kindRows = await this.prisma.receipt.groupBy({
      by: ['kind'],
      where: base,
      _count: { _all: true },
    })

    const counts = {
      all: 0,
      invoice: 0,
      booking_deposit: 0,
    }
    for (const row of kindRows) {
      const n = Number((row._count as { _all?: number } | undefined)?._all ?? 0)
      counts.all += n
      if (row.kind === ReceiptKind.booking_deposit) counts.booking_deposit += n
      else counts.invoice += n
    }
    return counts
  }

  async findAll(params: {
    keyword?: string
    customerId?: string
    customerNames?: string[]
    paymentMethods?: string[]
    kinds?: string[]
    receiptCodes?: string[]
    contractCodes?: string[]
    invoiceCodes?: string[]
    receivableCodes?: string[]
    amounts?: string[]
    remarks?: string[]
    changeLogs?: string[]
    createdBys?: string[]
    contractId?: string
    invoiceId?: string
    receivableId?: string
    sortBy?: string
    sortDir?: 'asc' | 'desc'
    paymentDateFrom?: string
    paymentDateTo?: string
    createdAtFrom?: string
    createdAtTo?: string
    cashFlowCounts?: string[]
    page?: number
    pageSize?: number
  }): Promise<PaginatedResult<ReturnType<typeof toReceiptDto>>> {
    const page = parsePage(params.page)
    const pageSize = parsePageSize(params.pageSize)
    const where = this.buildListWhere(params)
    const countIds = await this.resolveReceiptIdsByCashFlowCount(params.cashFlowCounts)
    if (countIds !== null) {
      const extra: Prisma.ReceiptWhereInput = !countIds.length
        ? { id: '__none__' }
        : { id: { in: countIds } }
      if (where.AND) {
        where.AND = Array.isArray(where.AND) ? [...where.AND, extra] : [where.AND, extra]
      } else {
        where.AND = [extra]
      }
    }
    await this.access.constrain(where, 'viaCustomer')
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
    kinds?: string[]
    receiptCodes?: string[]
    contractCodes?: string[]
    invoiceCodes?: string[]
    receivableCodes?: string[]
    amounts?: string[]
    remarks?: string[]
    changeLogs?: string[]
    createdBys?: string[]
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
    const kinds = (params.kinds || [])
      .map((k) => k.trim())
      .filter((k): k is ReceiptKind => k === ReceiptKind.booking_deposit || k === ReceiptKind.invoice)
    if (kinds.length === 1) where.kind = kinds[0]
    else if (kinds.length > 1) where.kind = { in: kinds }

    if (params.invoiceId?.trim()) {
      const invoiceId = params.invoiceId.trim()
      and.push({
        OR: [{ invoiceId }, { allocations: { some: { invoiceId } } }],
      })
    }
    if (params.receivableId?.trim()) {
      const receivableId = params.receivableId.trim()
      and.push({
        OR: [{ receivableId }, { allocations: { some: { receivableId } } }],
      })
    }

    const customerNameClause = stringFieldInOrEmpty('name', params.customerNames)
    if (customerNameClause) {
      and.push({ customer: customerNameClause } as Prisma.ReceiptWhereInput)
    }

    const paymentMethodClause = stringFieldInOrEmpty('paymentMethod', params.paymentMethods)
    if (paymentMethodClause) and.push(paymentMethodClause as Prisma.ReceiptWhereInput)

    const receiptCodeClause = stringFieldInOrEmpty('receiptCode', params.receiptCodes)
    if (receiptCodeClause) and.push(receiptCodeClause as Prisma.ReceiptWhereInput)

    const contractCodeClause = stringFieldInOrEmpty('contractCode', params.contractCodes)
    if (contractCodeClause) {
      and.push({ contract: contractCodeClause } as Prisma.ReceiptWhereInput)
    }

    const invoiceCodeClause = stringFieldInOrEmpty('invoiceCode', params.invoiceCodes)
    if (invoiceCodeClause) {
      and.push({
        OR: [
          { invoice: invoiceCodeClause },
          { allocations: { some: { receivable: { invoice: invoiceCodeClause } } } },
        ],
      } as Prisma.ReceiptWhereInput)
    }

    const receivableCodeClause = stringFieldInOrEmpty('receivableCode', params.receivableCodes)
    if (receivableCodeClause) {
      and.push({
        OR: [
          { receivable: receivableCodeClause },
          { allocations: { some: { receivable: receivableCodeClause } } },
        ],
      } as Prisma.ReceiptWhereInput)
    }

    const amountClause = numberFieldInOrEmpty('amount', params.amounts)
    if (amountClause) and.push(amountClause as Prisma.ReceiptWhereInput)

    const remarkClause = stringFieldInOrEmpty('remark', params.remarks)
    if (remarkClause) and.push(remarkClause as Prisma.ReceiptWhereInput)

    const changeLogClause = stringFieldInOrEmpty('changeLog', params.changeLogs)
    if (changeLogClause) and.push(changeLogClause as Prisma.ReceiptWhereInput)

    const createdByClause = actorLabelsOrEmpty('createdBy', params.createdBys)
    if (createdByClause) and.push(createdByClause as Prisma.ReceiptWhereInput)

    const keyword = params.keyword?.trim()
    if (keyword) {
      and.push({
        OR: [
          { receiptCode: { contains: keyword, mode: 'insensitive' } },
          { paymentMethod: { contains: keyword, mode: 'insensitive' } },
          { remark: { contains: keyword, mode: 'insensitive' } },
          { changeLog: { contains: keyword, mode: 'insensitive' } },
          { attachments: { some: { fileName: { contains: keyword, mode: 'insensitive' } } } },
          { customer: { name: { contains: keyword, mode: 'insensitive' } } },
          { customer: { customerCode: { contains: keyword, mode: 'insensitive' } } },
          { contract: { contractCode: { contains: keyword, mode: 'insensitive' } } },
          { invoice: { invoiceCode: { contains: keyword, mode: 'insensitive' } } },
          { receivable: { receivableCode: { contains: keyword, mode: 'insensitive' } } },
          {
            allocations: {
              some: {
                receivable: {
                  OR: [
                    { receivableCode: { contains: keyword, mode: 'insensitive' } },
                    { invoice: { invoiceCode: { contains: keyword, mode: 'insensitive' } } },
                  ],
                },
              },
            },
          },
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

  /** 资金流水条数表头筛选 */
  private async resolveReceiptIdsByCashFlowCount(
    raw?: string[],
  ): Promise<string[] | null> {
    const nums = (raw || [])
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .map((n) => Math.floor(n))
    if (!nums.length) return null
    const matched = new Set<string>()
    for (const n of [...new Set(nums)]) {
      if (n === 0) {
        const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT r.id FROM receipts r
           WHERE NOT EXISTS (
             SELECT 1 FROM cash_flows c WHERE c.receipt_id = r.id
           )`,
        )
        for (const r of rows) matched.add(r.id)
      } else {
        const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT r.id FROM receipts r
           WHERE (
             SELECT COUNT(*)::int FROM cash_flows c WHERE c.receipt_id = r.id
           ) = $1`,
          n,
        )
        for (const r of rows) matched.add(r.id)
      }
    }
    return [...matched]
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.ReceiptOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'desc'
    const key = (sortBy || '').trim()
    if (key === 'receiptCode') return [{ receiptCode: dir }]
    if (key === 'kind') return [{ kind: dir }, { receiptCode: dir }]
    if (key === 'customerName') return [{ customer: { name: dir } }]
    if (key === 'contractCode') return [{ contract: { contractCode: dir } }]
    if (key === 'invoiceCode') return [{ invoice: { invoiceCode: dir } }]
    if (key === 'receivableCode') return [{ receivable: { receivableCode: dir } }]
    if (key === 'paymentDate') return [{ paymentDate: dir }, { receiptCode: 'desc' }]
    if (key === 'paymentMethod') return [{ paymentMethod: dir }, { receiptCode: 'desc' }]
    if (key === 'amount') return [{ amount: dir }]
    if (key === 'remark') return [{ remark: dir }]
    if (key === 'changeLog') return [{ changeLog: dir }]
    if (key === 'cashFlowCount') return [{ cashFlows: { _count: dir } }]
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
    await this.access.assertCustomerId(row.customerId)
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

  /**
   * 按关联收据金额合计回写应收：已收 = Σ收据金额，未收 = max(0, 开票金额 − 已收)；
   * 并回写 relatedReceiptRef（收据编号逗号串）。
   */
  private async syncReceivableFromReceipts(receivableId: string | null | undefined) {
    await syncReceivableReceivedAmount(this.prisma, (receivableId || '').trim())
  }

  /** 关联应收时校验：金额 > 0 且不超过当前未收 */
  private async assertReceivablePaymentAmount(
    receivableId: string | null | undefined,
    amount: Prisma.Decimal,
  ) {
    const id = (receivableId || '').trim()
    if (!id) return
    const recv = await this.prisma.receivable.findUnique({
      where: { id },
      select: { receivableAmount: true, receivableCode: true },
    })
    if (!recv) throw new BadRequestException('Invalid receivableId')
    const amt = Number(amount.toString())
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new BadRequestException('收款金额须大于 0')
    }
    const outstanding = Number(recv.receivableAmount.toString())
    const due = Number.isFinite(outstanding) ? outstanding : 0
    if (amt > due + 0.009) {
      throw new BadRequestException(
        `收款金额不可超过未收金额（应收 ${recv.receivableCode || id} 未收 ${due.toFixed(2)}）`,
      )
    }
  }

  /** 单应收挂靠时写入一条分摊；无应收则清空分摊 */
  private async replaceSingleAllocation(
    db: Prisma.TransactionClient | PrismaService,
    receiptId: string,
    receivableId: string | null,
    invoiceId: string | null,
    amount: Prisma.Decimal,
    actorId?: string | null,
  ) {
    await db.receiptAllocation.deleteMany({ where: { receiptId } })
    if (!receivableId) return
    await db.receiptAllocation.create({
      data: {
        receiptId,
        receivableId,
        invoiceId,
        amount,
        sortOrder: 0,
        remark: '',
        createdById: actorId || null,
        updatedById: actorId || null,
      },
    })
  }

  async create(dto: CreateReceiptDto, actorId?: string | null) {
    const links = await this.resolveLinks(dto)
    const receiptCode = s(dto.receiptCode) || (await this.nextReceiptCode())
    // 关联发票时一律视为发票收据；否则尊重传入 kind，默认 invoice
    const kind = links.invoiceId
      ? ReceiptKind.invoice
      : dto.kind === ReceiptKind.booking_deposit
        ? ReceiptKind.booking_deposit
        : ReceiptKind.invoice
    const amount = decimalField(dto.amount, 'amount')
    await this.assertReceivablePaymentAmount(links.receivableId, amount)

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.receipt.create({
          data: {
            receiptCode,
            kind,
            customerId: links.customerId,
            contractId: links.contractId,
            invoiceId: links.invoiceId,
            receivableId: links.receivableId,
            paymentDate: parseDateOnly(dto.paymentDate, 'paymentDate'),
            paymentMethod: s(dto.paymentMethod),
            amount,
            remark: s(dto.remark),
            changeLog: s(dto.changeLog),
            createdById: actorId || null,
            updatedById: actorId || null,
          },
          select: { id: true },
        })
        if (kind === ReceiptKind.invoice && links.receivableId) {
          await this.replaceSingleAllocation(
            tx,
            created.id,
            links.receivableId,
            links.invoiceId,
            amount,
            actorId,
          )
        }
        return tx.receipt.findUniqueOrThrow({
          where: { id: created.id },
          include: receiptInclude,
        })
      })
      await this.syncReceivableFromReceipts(links.receivableId)
      await this.recordCashFlowForReceipt(row, actorId)
      return toReceiptDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`收据编号「${receiptCode}」已存在`)
      }
      throw e
    }
  }

  /**
   * 开单幂等：按合约定金生成「定金收据」，并回写 contract.bookingDepositReceiptId。
   * 金额可为 0；已有指针或已有同合约定金收据则复用。
   * 若合约有收款凭证路径，同步写入收据附件表（引用同一 storageKey，不复制文件）。
   */
  async ensureBookingDepositReceipt(
    contract: BookingDepositContractSource,
    actorId?: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const db = tx ?? this.prisma
    if (contract.bookingDepositReceiptId) {
      return contract.bookingDepositReceiptId
    }

    const existing = await db.receipt.findFirst({
      where: { contractId: contract.id, kind: ReceiptKind.booking_deposit },
      select: { id: true },
    })
    if (existing) {
      await db.contract.update({
        where: { id: contract.id },
        data: { bookingDepositReceiptId: existing.id },
      })
      return existing.id
    }

    const receiptCode = await this.nextReceiptCode()
    const amountRaw =
      contract.bookingDeposit == null ? 0 : Number(contract.bookingDeposit.toString())
    const amount = Number.isNaN(amountRaw) ? 0 : amountRaw
    const voucherKey = s(contract.paymentVoucher)

    try {
      const created = await db.receipt.create({
        data: {
          receiptCode,
          kind: ReceiptKind.booking_deposit,
          customerId: contract.customerId,
          contractId: contract.id,
          paymentDate: contract.paymentDate,
          paymentMethod: s(contract.paymentMethod),
          amount: new Prisma.Decimal(amount),
          remark: '定金收據',
          createdById: actorId || null,
          updatedById: actorId || null,
          ...(voucherKey
            ? {
                attachments: {
                  create: {
                    fileName: fileNameFromStorageKey(voucherKey),
                    storageKey: voucherKey,
                    sortOrder: 0,
                    createdById: actorId || null,
                    updatedById: actorId || null,
                  },
                },
              }
            : {}),
        },
        select: { id: true },
      })
      await db.contract.update({
        where: { id: contract.id },
        data: { bookingDepositReceiptId: created.id },
      })
      if (amount > 0.009) {
        await this.cashFlows.recordReceiptIn(
          {
            receiptId: created.id,
            amount,
            flowDate: contract.paymentDate || new Date(),
            paymentMethod: s(contract.paymentMethod),
            contractId: contract.id,
            customerId: contract.customerId,
            remark: '定金收据入账',
            actorId,
          },
          db,
        )
      }
      return created.id
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // 并发下可能已由另一事务创建；回读并钉指针
        const raced = await db.receipt.findFirst({
          where: { contractId: contract.id, kind: ReceiptKind.booking_deposit },
          select: { id: true },
        })
        if (raced) {
          await db.contract.update({
            where: { id: contract.id },
            data: { bookingDepositReceiptId: raced.id },
          })
          return raced.id
        }
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

    let kind: ReceiptKind | undefined
    if (invoiceId) {
      kind = ReceiptKind.invoice
    } else if (dto.kind !== undefined) {
      kind = dto.kind
    }

    const prevAllocations = await this.prisma.receiptAllocation.findMany({
      where: { receiptId: id },
      select: { receivableId: true, amount: true },
    })
    const prevReceivableIds = [
      ...prevAllocations.map((a) => a.receivableId),
      existing.receivableId,
    ]
    const nextAmount =
      dto.amount !== undefined ? decimalField(dto.amount, 'amount') : existing.amount
    const nextKind = kind ?? existing.kind
    const touchesMoneyOrLink =
      dto.amount !== undefined ||
      touchReceivable ||
      touchInvoice ||
      dto.paymentMethod !== undefined

    if (prevAllocations.length > 1 && touchesMoneyOrLink) {
      throw new BadRequestException(
        '该收据已分摊到多张应收，请删除后重新收款；编辑仅支持改备注等非金额字段',
      )
    }

    if (receivableId && nextKind === ReceiptKind.invoice) {
      const oldOnThis = prevAllocations.find((a) => a.receivableId === receivableId)
      const creditBack = Number(oldOnThis?.amount?.toString() ?? 0)
      const recv = await this.prisma.receivable.findUnique({
        where: { id: receivableId },
        select: { receivableAmount: true, receivableCode: true },
      })
      if (!recv) throw new BadRequestException('Invalid receivableId')
      const amt = Number(nextAmount.toString())
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new BadRequestException('收款金额须大于 0')
      }
      const outstanding = Number(recv.receivableAmount.toString())
      const due =
        (Number.isFinite(outstanding) ? outstanding : 0) +
        (Number.isFinite(creditBack) ? creditBack : 0)
      if (amt > due + 0.009) {
        throw new BadRequestException(
          `收款金额不可超过未收金额（应收 ${recv.receivableCode || receivableId} 未收 ${due.toFixed(2)}）`,
        )
      }
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.receipt.update({
          where: { id },
          data: {
            receiptCode,
            ...(kind !== undefined ? { kind } : {}),
            customerId,
            contractId,
            invoiceId,
            receivableId,
            paymentDate:
              dto.paymentDate !== undefined
                ? parseDateOnly(dto.paymentDate, 'paymentDate')
                : undefined,
            paymentMethod: dto.paymentMethod !== undefined ? s(dto.paymentMethod) : undefined,
            amount: dto.amount !== undefined ? nextAmount : undefined,
            remark: dto.remark !== undefined ? s(dto.remark) : undefined,
            changeLog: dto.changeLog !== undefined ? s(dto.changeLog) : undefined,
            updatedById: actorId || null,
          },
        })
        if (prevAllocations.length <= 1) {
          if (nextKind === ReceiptKind.invoice) {
            await this.replaceSingleAllocation(
              tx,
              id,
              receivableId,
              invoiceId,
              nextAmount,
              actorId,
            )
          } else {
            await tx.receiptAllocation.deleteMany({ where: { receiptId: id } })
          }
        }
        return tx.receipt.findUniqueOrThrow({
          where: { id },
          include: receiptInclude,
        })
      })
      await syncReceivableReceivedAmounts(this.prisma, [
        ...prevReceivableIds,
        receivableId,
      ])
      await this.recordCashFlowForReceipt(row, actorId)
      return toReceiptDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`收据编号「${receiptCode}」已存在`)
      }
      throw e
    }
  }

  private async recordCashFlowForReceipt(
    row: {
      id: string
      amount: Prisma.Decimal | number
      paymentDate: Date | null
      paymentMethod: string
      contractId: string | null
      customerId: string
    },
    actorId?: string | null,
  ) {
    const amount = Number(row.amount?.toString?.() ?? row.amount ?? 0)
    if (!(amount > 0.009)) return
    await this.cashFlows.recordReceiptIn({
      receiptId: row.id,
      amount,
      flowDate: row.paymentDate || new Date(),
      paymentMethod: row.paymentMethod || '',
      contractId: row.contractId,
      customerId: row.customerId,
      actorId,
    })
  }

  private absPath(storageKey: string) {
    const rel = receiptAttachmentStorageRel(storageKey)
    if (!rel || rel.includes('..')) {
      throw new BadRequestException('非法附件路径')
    }
    return path.join(uploadsRoot(), rel)
  }

  private storageKeyForReceiptAttachment(receiptId: string, fileName: string) {
    const id = s(receiptId)
    const base = path.basename(s(fileName))
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      throw new BadRequestException('非法收据 ID')
    }
    if (!base || base.includes('..') || base.includes('/') || base.includes('\\')) {
      throw new BadRequestException('非法文件名')
    }
    const unique = `${Date.now()}_${base}`
    return `receipts/${id}/${unique}`
  }

  private async removeStoredAttachmentFile(storageKey: string) {
    if (!storageKey || isExternalReceiptAttachmentKey(storageKey)) return
    // 共享自 uploads/attachments 的凭证不随收据删除而删物理文件
    const rel = receiptAttachmentStorageRel(storageKey)
    if (rel.startsWith('attachments/')) return
    const abs = this.absPath(storageKey)
    await fs.rm(abs, { force: true }).catch(() => undefined)
  }

  private async removeReceiptAttachmentDir(receiptId: string) {
    const dir = path.join(uploadsRoot(), 'receipts', receiptId)
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }

  async uploadAttachments(receiptId: string, files: Express.Multer.File[], actor = '') {
    const receipt = await this.prisma.receipt.findUnique({ where: { id: receiptId } })
    if (!receipt) throw new NotFoundException(`Receipt ${receiptId} not found`)
    await this.access.assertCustomerId(receipt.customerId)
    if (!files?.length) throw new BadRequestException('请至少上传一个文件')

    const maxSort = await this.prisma.receiptAttachment.aggregate({
      where: { receiptId },
      _max: { sortOrder: true },
    })
    let nextSort = (maxSort._max.sortOrder ?? -1) + 1
    const actorId = actor || null
    const created = []

    for (const file of files) {
      const { fileName, buffer } = assertAttachmentFile(file)
      const storageKey = this.storageKeyForReceiptAttachment(receiptId, fileName)
      const abs = this.absPath(storageKey)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, buffer)
      const row = await this.prisma.receiptAttachment.create({
        data: {
          receiptId,
          fileName,
          storageKey,
          sortOrder: nextSort++,
          createdById: actorId,
          updatedById: actorId,
        },
      })
      created.push(toReceiptAttachmentDto(row))
    }
    return created
  }

  async removeAttachment(receiptId: string, attachmentId: string) {
    const row = await this.prisma.receiptAttachment.findFirst({
      where: { id: attachmentId, receiptId },
    })
    if (!row) throw new NotFoundException(`Receipt attachment ${attachmentId} not found`)
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      select: { customerId: true },
    })
    if (!receipt) throw new NotFoundException(`Receipt ${receiptId} not found`)
    await this.access.assertCustomerId(receipt.customerId)
    await this.prisma.receiptAttachment.delete({ where: { id: attachmentId } })
    await this.removeStoredAttachmentFile(row.storageKey)
    return { success: true }
  }

  async getAttachmentFile(receiptId: string, attachmentId: string): Promise<StreamableFile> {
    const row = await this.prisma.receiptAttachment.findFirst({
      where: { id: attachmentId, receiptId },
    })
    if (!row) throw new NotFoundException(`Receipt attachment ${attachmentId} not found`)
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      select: { customerId: true },
    })
    if (!receipt) throw new NotFoundException(`Receipt ${receiptId} not found`)
    await this.access.assertCustomerId(receipt.customerId)
    if (isExternalReceiptAttachmentKey(row.storageKey)) {
      throw new BadRequestException('该附件为外部地址，请直接使用 publicUrl')
    }
    const abs = this.absPath(row.storageKey)
    try {
      await fs.access(abs)
    } catch {
      throw new NotFoundException('附件文件不存在')
    }
    const stream = createReadStream(abs)
    return new StreamableFile(stream, {
      type: mimeFromFileName(row.fileName),
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
    })
  }

  async remove(id: string) {
    const existing = await this.prisma.receipt.findUnique({
      where: { id },
      include: {
        attachments: true,
        allocations: { select: { receivableId: true } },
      },
    })
    if (!existing) throw new NotFoundException('Receipt not found')
    await this.access.assertCustomerId(existing.customerId)
    const receivableIds = [
      ...existing.allocations.map((a) => a.receivableId),
      existing.receivableId,
    ]
    try {
      // 附件／分摊 Cascade；合约定金指针 SetNull
      await this.prisma.receipt.delete({ where: { id } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') throw new NotFoundException('Receipt not found')
        if (e.code === 'P2003') {
          throw new ConflictException('无法删除：收据仍有关联数据，请先处理关联记录')
        }
      }
      throw e
    }
    for (const att of existing.attachments) {
      await this.removeStoredAttachmentFile(att.storageKey)
    }
    await this.removeReceiptAttachmentDir(id)
    await syncReceivableReceivedAmounts(this.prisma, receivableIds)
    return { success: true }
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id))
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
