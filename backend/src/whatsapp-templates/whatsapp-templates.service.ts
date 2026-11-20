import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  CreateWhatsappTemplateDto,
  ReorderWhatsappTemplatesDto,
  UpdateWhatsappTemplateDto,
} from './dto/whatsapp-template.dto'
import {
  sanitizeWhatsappDiagramKey,
  toWhatsappTemplateDto,
  whatsappTemplateAuditInclude,
} from './whatsapp-template.mapper'
import { runBatchRemove } from '../common/batch-delete'

function s(v?: string | null) {
  return (v ?? '').trim()
}

function uniqIds(ids: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of ids) {
    const id = s(raw)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

@Injectable()
export class WhatsappTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { activeOnly?: boolean; buildingId?: string; categoryId?: string }) {
    const where: Prisma.WhatsappTemplateWhereInput = {}
    if (params.activeOnly) where.active = true
    if (params.buildingId) {
      where.buildings = { some: { buildingId: params.buildingId } }
    }
    if (params.categoryId) where.categoryId = params.categoryId

    const rows = await this.prisma.whatsappTemplate.findMany({
      where,
      include: whatsappTemplateAuditInclude,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    })
    return rows.map(toWhatsappTemplateDto)
  }

  async findOne(id: string) {
    const row = await this.prisma.whatsappTemplate.findUnique({
      where: { id },
      include: whatsappTemplateAuditInclude,
    })
    if (!row) throw new NotFoundException(`WhatsApp template ${id} not found`)
    return toWhatsappTemplateDto(row)
  }

  private async assertCategory(categoryId: string) {
    const category = await this.prisma.whatsappTemplateCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, label: true, active: true },
    })
    if (!category) throw new BadRequestException(`模板分類不存在：${categoryId}`)
    return category
  }

  private async assertBuildings(buildingIds: string[]) {
    if (!buildingIds.length) throw new BadRequestException('至少選擇一座大廈')
    const rows = await this.prisma.building.findMany({
      where: { id: { in: buildingIds } },
      select: { id: true, name: true },
    })
    if (rows.length !== buildingIds.length) {
      const found = new Set(rows.map((r) => r.id))
      const missing = buildingIds.filter((id) => !found.has(id))
      throw new BadRequestException(`大廈不存在：${missing.join('、')}`)
    }
    return rows
  }

  /** 同一大廈同一分類至多綁一條模板（排除自身） */
  private async assertNoCategoryConflict(
    categoryId: string,
    buildingIds: string[],
    excludeTemplateId?: string,
  ) {
    const conflicts = await this.prisma.whatsappTemplateBuilding.findMany({
      where: {
        buildingId: { in: buildingIds },
        template: {
          categoryId,
          ...(excludeTemplateId ? { id: { not: excludeTemplateId } } : {}),
        },
      },
      select: {
        buildingId: true,
        building: { select: { name: true } },
        template: { select: { label: true } },
      },
    })
    if (!conflicts.length) return
    const detail = conflicts
      .map(
        (c) =>
          `${c.building?.name || c.buildingId}（已有「${c.template?.label || ''}」）`,
      )
      .join('、')
    throw new ConflictException(`以下大廈在此分類下已有模板：${detail}`)
  }

  async create(dto: CreateWhatsappTemplateDto, actor = '') {
    const label = s(dto.label)
    const templateName = s(dto.templateName)
    const categoryId = s(dto.categoryId)
    const buildingIds = uniqIds(dto.buildingIds || [])
    if (!categoryId) throw new BadRequestException('Category is required')
    if (!label) throw new BadRequestException('Label is required')
    if (!templateName) throw new BadRequestException('Template name is required')
    await this.assertCategory(categoryId)
    await this.assertBuildings(buildingIds)
    await this.assertNoCategoryConflict(categoryId, buildingIds)
    const actorId = actor || null

    try {
      const row = await this.prisma.whatsappTemplate.create({
        data: {
          categoryId,
          label,
          templateName,
          remark: s(dto.remark),
          diagramKey: sanitizeWhatsappDiagramKey(dto.diagramKey),
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
          createdById: actorId,
          updatedById: actorId,
          buildings: {
            create: buildingIds.map((buildingId) => ({ buildingId })),
          },
        },
        include: whatsappTemplateAuditInclude,
      })
      return toWhatsappTemplateDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('WhatsApp 模板顯示名或模板名稱已存在')
      }
      throw e
    }
  }

  async update(id: string, dto: UpdateWhatsappTemplateDto, actor = '') {
    const existing = await this.prisma.whatsappTemplate.findUnique({
      where: { id },
      include: { buildings: { select: { buildingId: true } } },
    })
    if (!existing) throw new NotFoundException(`WhatsApp template ${id} not found`)

    const nextCategoryId =
      dto.categoryId !== undefined ? s(dto.categoryId) : existing.categoryId
    if (!nextCategoryId) throw new BadRequestException('Category is required')

    const nextBuildingIds =
      dto.buildingIds !== undefined
        ? uniqIds(dto.buildingIds)
        : existing.buildings.map((b) => b.buildingId)

    if (dto.categoryId !== undefined) await this.assertCategory(nextCategoryId)
    if (dto.buildingIds !== undefined) await this.assertBuildings(nextBuildingIds)

    if (dto.buildingIds !== undefined || dto.categoryId !== undefined) {
      await this.assertNoCategoryConflict(nextCategoryId, nextBuildingIds, id)
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (dto.buildingIds !== undefined) {
          await tx.whatsappTemplateBuilding.deleteMany({ where: { templateId: id } })
          await tx.whatsappTemplateBuilding.createMany({
            data: nextBuildingIds.map((buildingId) => ({ templateId: id, buildingId })),
          })
        }
        return tx.whatsappTemplate.update({
          where: { id },
          data: {
            categoryId: dto.categoryId !== undefined ? nextCategoryId : undefined,
            label: dto.label !== undefined ? s(dto.label) : undefined,
            templateName: dto.templateName !== undefined ? s(dto.templateName) : undefined,
            remark: dto.remark !== undefined ? s(dto.remark) : undefined,
            diagramKey:
              dto.diagramKey !== undefined
                ? sanitizeWhatsappDiagramKey(dto.diagramKey)
                : undefined,
            sortOrder: dto.sortOrder,
            active: dto.active,
            ...(actor ? { updatedById: actor } : {}),
          },
          include: whatsappTemplateAuditInclude,
        })
      })
      return toWhatsappTemplateDto(row)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('WhatsApp 模板顯示名或模板名稱已存在')
      }
      throw e
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.whatsappTemplate.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException(`WhatsApp template ${id} not found`)
    await this.prisma.whatsappTemplate.delete({ where: { id } })
    return { success: true }
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id))
  }

  /** 批量更新 sortOrder（拖拽排序） */
  async reorder(dto: ReorderWhatsappTemplatesDto, actor = '') {
    const items = dto.items || []
    if (!items.length) return { success: true }

    const ids = items.map((i) => i.id)
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Duplicate WhatsApp template ids in reorder payload')
    }

    const rows = await this.prisma.whatsappTemplate.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    })
    if (rows.length !== ids.length) {
      throw new BadRequestException('One or more WhatsApp template ids are invalid')
    }

    const actorId = actor || null
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.whatsappTemplate.update({
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
