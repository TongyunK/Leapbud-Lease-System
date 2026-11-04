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
  CreateDepositRefundDto,
  ImportDepositRefundsDto,
  UpdateDepositRefundDto,
} from './dto/deposit-refund.dto'
import { depositRefundInclude, toDepositRefundDto } from './deposit-refund.mapper'
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

@Injectable()
export class DepositRefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BuildingAccessService,
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

  async create(dto: CreateDepositRefundDto, actorId?: string | null) {
    const contract = await this.resolveContract(dto)
    const customerId = s(dto.customerId) || contract.customerId
    const roomId = s(dto.roomId) || contract.roomId
    const handlerId = dto.handlerId === undefined ? null : nullId(dto.handlerId)
    await this.assertHandler(handlerId)

    const refundCode = s(dto.refundCode) || (await this.nextRefundCode())
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
          actualRefundAmount: decimalField(dto.actualRefundAmount, 'actualRefundAmount'),
          handlerId,
          voucherImage: s(dto.voucherImage),
          voucherAttachment: s(dto.voucherAttachment),
          remark: s(dto.remark),
          createdById: actorId || null,
          updatedById: actorId || null,
        },
        include: depositRefundInclude,
      })
      return toDepositRefundDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`退还编号「${refundCode}」已存在`)
      }
      throw e
    }
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
          actualRefundAmount:
            dto.actualRefundAmount !== undefined
              ? decimalField(dto.actualRefundAmount, 'actualRefundAmount')
              : undefined,
          handlerId,
          voucherImage: dto.voucherImage !== undefined ? s(dto.voucherImage) : undefined,
          voucherAttachment:
            dto.voucherAttachment !== undefined ? s(dto.voucherAttachment) : undefined,
          remark: dto.remark !== undefined ? s(dto.remark) : undefined,
          updatedById: actorId || null,
        },
        include: depositRefundInclude,
      })
      return toDepositRefundDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`退还编号「${refundCode}」已存在`)
      }
      throw e
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.depositRefund.delete({ where: { id } })
      return { success: true }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Deposit refund not found')
      }
      throw e
    }
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, async (id) => {
      await this.prisma.depositRefund.delete({ where: { id } })
    })
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
