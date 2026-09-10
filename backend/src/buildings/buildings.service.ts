import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildingListInclude, toBuildingDto } from '../common/dto-mappers';
import {
  CreateBuildingDto,
  ImportBuildingsDto,
  UpdateBuildingDto,
} from './dto/building.dto';

function s(v?: string | null) {
  return (v ?? '').trim();
}

@Injectable()
export class BuildingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { keyword?: string; activeOnly?: boolean } = {}) {
    const q = params.keyword?.trim();
    const where: Prisma.BuildingWhereInput = {};

    if (params.activeOnly) where.active = true;

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
        { addressEn: { contains: q, mode: 'insensitive' } },
        { manager: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { managerPhone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.building.findMany({
      where,
      include: buildingListInclude,
      orderBy: { name: 'asc' },
    });
    return rows.map(toBuildingDto);
  }

  async findOne(id: string) {
    const row = await this.prisma.building.findUnique({
      where: { id },
      include: buildingListInclude,
    });
    if (!row) throw new NotFoundException(`Building ${id} not found`);
    return toBuildingDto(row);
  }

  async create(dto: CreateBuildingDto, actor = '') {
    const name = s(dto.name);
    if (!name) throw new BadRequestException('name is required');
    const actorId = actor || null;

    const row = await this.prisma.building.create({
      data: {
        name,
        address: s(dto.address),
        addressEn: s(dto.addressEn),
        manager: s(dto.manager),
        managerPhone: s(dto.managerPhone),
        email: s(dto.email),
        workingHours: s(dto.workingHours),
        fpsId: s(dto.fpsId) || null,
        bankAccountHolder: s(dto.bankAccountHolder) || null,
        bankAccount: s(dto.bankAccount) || null,
        apiTemplateSuffix: s(dto.apiTemplateSuffix) || null,
        useWbaNumber: s(dto.useWbaNumber) || null,
        buildingConfig: s(dto.buildingConfig) || null,
        chequePaymentBy: s(dto.chequePaymentBy) || null,
        paymentAdvice: s(dto.paymentAdvice) || null,
        active: dto.active !== undefined ? !!dto.active : true,
        createdById: actorId,
        updatedById: actorId,
      },
      include: buildingListInclude,
    });
    return toBuildingDto(row);
  }

  async update(id: string, dto: UpdateBuildingDto, actor = '') {
    const existing = await this.prisma.building.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Building ${id} not found`);

    const row = await this.prisma.building.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? s(dto.name) : undefined,
        address: dto.address !== undefined ? s(dto.address) : undefined,
        addressEn: dto.addressEn !== undefined ? s(dto.addressEn) : undefined,
        manager: dto.manager !== undefined ? s(dto.manager) : undefined,
        managerPhone: dto.managerPhone !== undefined ? s(dto.managerPhone) : undefined,
        email: dto.email !== undefined ? s(dto.email) : undefined,
        workingHours: dto.workingHours !== undefined ? s(dto.workingHours) : undefined,
        fpsId: dto.fpsId !== undefined ? s(dto.fpsId) || null : undefined,
        bankAccountHolder:
          dto.bankAccountHolder !== undefined ? s(dto.bankAccountHolder) || null : undefined,
        bankAccount: dto.bankAccount !== undefined ? s(dto.bankAccount) || null : undefined,
        apiTemplateSuffix:
          dto.apiTemplateSuffix !== undefined ? s(dto.apiTemplateSuffix) || null : undefined,
        useWbaNumber: dto.useWbaNumber !== undefined ? s(dto.useWbaNumber) || null : undefined,
        buildingConfig:
          dto.buildingConfig !== undefined ? s(dto.buildingConfig) || null : undefined,
        chequePaymentBy:
          dto.chequePaymentBy !== undefined ? s(dto.chequePaymentBy) || null : undefined,
        paymentAdvice: dto.paymentAdvice !== undefined ? s(dto.paymentAdvice) || null : undefined,
        active: dto.active,
        ...(actor ? { updatedById: actor } : {}),
      },
      include: buildingListInclude,
    });
    return toBuildingDto(row);
  }

  /** 按大厦名称 upsert（名称匹配大小写不敏感） */
  async importBatch(dto: ImportBuildingsDto, actor = '') {
    const items = dto.items || [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    const existing = await this.prisma.building.findMany({
      select: { id: true, name: true },
    });
    const byName = new Map(existing.map((b) => [b.name.trim().toLowerCase(), b]));

    for (const item of items) {
      const name = s(item.name);
      if (!name) {
        skipped += 1;
        continue;
      }
      try {
        const hit = byName.get(name.toLowerCase());
        if (hit) {
          await this.update(hit.id, item, actor);
          updated += 1;
        } else {
          const row = await this.create(item, actor);
          byName.set(name.toLowerCase(), { id: row.id, name });
          created += 1;
        }
      } catch {
        failed += 1;
      }
    }

    return { created, updated, skipped, failed };
  }
}
