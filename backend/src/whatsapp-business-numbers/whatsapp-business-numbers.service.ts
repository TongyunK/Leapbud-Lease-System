import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  CreateWhatsappBusinessNumberDto,
  ReorderWhatsappBusinessNumbersDto,
  UpdateWhatsappBusinessNumberDto,
} from './dto/whatsapp-business-number.dto'
import {
  toWhatsappBusinessNumberDto,
  whatsappBusinessNumberAuditInclude,
} from './whatsapp-business-number.mapper'
import { runBatchRemove } from '../common/batch-delete'

function s(v?: string | null) {
  return (v ?? '').trim()
}

@Injectable()
export class WhatsappBusinessNumbersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { activeOnly?: boolean }) {
    const where: Prisma.WhatsappBusinessNumberWhereInput = {}
    if (params.activeOnly) where.active = true

    const rows = await this.prisma.whatsappBusinessNumber.findMany({
      where,
      include: whatsappBusinessNumberAuditInclude,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    })
    return rows.map(toWhatsappBusinessNumberDto)
  }

  async findOne(id: string) {
    const row = await this.prisma.whatsappBusinessNumber.findUnique({
      where: { id },
      include: whatsappBusinessNumberAuditInclude,
    })
    if (!row) throw new NotFoundException(`WhatsApp business number ${id} not found`)
    return toWhatsappBusinessNumberDto(row)
  }

  async create(dto: CreateWhatsappBusinessNumberDto, actor = '') {
    const label = s(dto.label)
    const phoneNumber = s(dto.phoneNumber)
    if (!label) throw new BadRequestException('Label is required')
    if (!phoneNumber) throw new BadRequestException('Phone number is required')
    const actorId = actor || null

    try {
      const row = await this.prisma.whatsappBusinessNumber.create({
        data: {
          label,
          phoneNumber,
          remark: s(dto.remark),
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
          createdById: actorId,
          updatedById: actorId,
        },
        include: whatsappBusinessNumberAuditInclude,
      })
      return toWhatsappBusinessNumberDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('WhatsApp 商業號碼顯示名或號碼已存在')
      }
      throw e
    }
  }

  async update(id: string, dto: UpdateWhatsappBusinessNumberDto, actor = '') {
    const existing = await this.prisma.whatsappBusinessNumber.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException(`WhatsApp business number ${id} not found`)

    try {
      const row = await this.prisma.whatsappBusinessNumber.update({
        where: { id },
        data: {
          label: dto.label !== undefined ? s(dto.label) : undefined,
          phoneNumber: dto.phoneNumber !== undefined ? s(dto.phoneNumber) : undefined,
          remark: dto.remark !== undefined ? s(dto.remark) : undefined,
          sortOrder: dto.sortOrder,
          active: dto.active,
          ...(actor ? { updatedById: actor } : {}),
        },
        include: whatsappBusinessNumberAuditInclude,
      })
      return toWhatsappBusinessNumberDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('WhatsApp 商業號碼顯示名或號碼已存在')
      }
      throw e
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.whatsappBusinessNumber.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException(`WhatsApp business number ${id} not found`)
    await this.prisma.whatsappBusinessNumber.delete({ where: { id } })
    return { success: true }
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id))
  }

  /** 批量更新 sortOrder（拖拽排序） */
  async reorder(dto: ReorderWhatsappBusinessNumbersDto, actor = '') {
    const items = dto.items || []
    if (!items.length) return { success: true }

    const ids = items.map((i) => i.id)
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Duplicate WhatsApp business number ids in reorder payload')
    }

    const rows = await this.prisma.whatsappBusinessNumber.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    })
    if (rows.length !== ids.length) {
      throw new BadRequestException('One or more WhatsApp business number ids are invalid')
    }

    const actorId = actor || null
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.whatsappBusinessNumber.update({
          where: { id: item.id },
          data: {
            sortOrder: item.sortOrder,
            ...(actorId ? { updatedById: actorId } : {}),
          },
        }),
      ),
    )
    return { success: true }
  }
}
