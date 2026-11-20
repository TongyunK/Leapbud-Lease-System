import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  CreateWhatsappTemplateCategoryDto,
  ReorderWhatsappTemplateCategoriesDto,
  UpdateWhatsappTemplateCategoryDto,
} from './dto/whatsapp-template-category.dto'
import {
  toWhatsappTemplateCategoryDto,
  whatsappTemplateCategoryAuditInclude,
} from './whatsapp-template-category.mapper'
import { runBatchRemove } from '../common/batch-delete'

function s(v?: string | null) {
  return (v ?? '').trim()
}

@Injectable()
export class WhatsappTemplateCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { activeOnly?: boolean }) {
    const where: Prisma.WhatsappTemplateCategoryWhereInput = {}
    if (params.activeOnly) where.active = true

    const rows = await this.prisma.whatsappTemplateCategory.findMany({
      where,
      include: whatsappTemplateCategoryAuditInclude,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    })
    return rows.map(toWhatsappTemplateCategoryDto)
  }

  async findOne(id: string) {
    const row = await this.prisma.whatsappTemplateCategory.findUnique({
      where: { id },
      include: whatsappTemplateCategoryAuditInclude,
    })
    if (!row) throw new NotFoundException(`WhatsApp template category ${id} not found`)
    return toWhatsappTemplateCategoryDto(row)
  }

  async create(dto: CreateWhatsappTemplateCategoryDto, actor = '') {
    const code = s(dto.code).toLowerCase()
    const label = s(dto.label)
    if (!code) throw new BadRequestException('Code is required')
    if (!label) throw new BadRequestException('Label is required')
    const actorId = actor || null

    try {
      const row = await this.prisma.whatsappTemplateCategory.create({
        data: {
          code,
          label,
          badgeTone: s(dto.badgeTone) || 'neutral',
          remark: s(dto.remark),
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
          createdById: actorId,
          updatedById: actorId,
        },
        include: whatsappTemplateCategoryAuditInclude,
      })
      return toWhatsappTemplateCategoryDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('WhatsApp 模板分類編碼或顯示名已存在')
      }
      throw e
    }
  }

  async update(id: string, dto: UpdateWhatsappTemplateCategoryDto, actor = '') {
    const existing = await this.prisma.whatsappTemplateCategory.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException(`WhatsApp template category ${id} not found`)

    try {
      const row = await this.prisma.whatsappTemplateCategory.update({
        where: { id },
        data: {
          code: dto.code !== undefined ? s(dto.code).toLowerCase() : undefined,
          label: dto.label !== undefined ? s(dto.label) : undefined,
          badgeTone: dto.badgeTone !== undefined ? s(dto.badgeTone) || 'neutral' : undefined,
          remark: dto.remark !== undefined ? s(dto.remark) : undefined,
          sortOrder: dto.sortOrder,
          active: dto.active,
          ...(actor ? { updatedById: actor } : {}),
        },
        include: whatsappTemplateCategoryAuditInclude,
      })
      return toWhatsappTemplateCategoryDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('WhatsApp 模板分類編碼或顯示名已存在')
      }
      throw e
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.whatsappTemplateCategory.findUnique({
      where: { id },
      include: { _count: { select: { templates: true } } },
    })
    if (!existing) throw new NotFoundException(`WhatsApp template category ${id} not found`)
    if (existing._count.templates > 0) {
      throw new ConflictException(
        `分類「${existing.label}」仍有 ${existing._count.templates} 條發送模板，請先改綁或刪除模板`,
      )
    }
    await this.prisma.whatsappTemplateCategory.delete({ where: { id } })
    return { success: true }
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id))
  }

  async reorder(dto: ReorderWhatsappTemplateCategoriesDto, actor = '') {
    const items = dto.items || []
    if (!items.length) return { success: true }

    const ids = items.map((i) => i.id)
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Duplicate WhatsApp template category ids in reorder payload')
    }

    const rows = await this.prisma.whatsappTemplateCategory.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    })
    if (rows.length !== ids.length) {
      throw new BadRequestException('One or more WhatsApp template category ids are invalid')
    }

    const actorId = actor || null
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.whatsappTemplateCategory.update({
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
