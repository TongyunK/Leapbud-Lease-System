import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toBuildingDto } from '../common/dto-mappers';
import { UpdateBuildingDto } from './dto/building.dto';

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
      include: { rooms: { select: { id: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(toBuildingDto);
  }

  async findOne(id: string) {
    const row = await this.prisma.building.findUnique({
      where: { id },
      include: { rooms: { select: { id: true } } },
    });
    if (!row) throw new NotFoundException(`Building ${id} not found`);
    return toBuildingDto(row);
  }

  async update(id: string, dto: UpdateBuildingDto, actor = '') {
    const existing = await this.prisma.building.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Building ${id} not found`);

    const row = await this.prisma.building.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        address: dto.address,
        addressEn: dto.addressEn,
        manager: dto.manager,
        managerPhone: dto.managerPhone,
        email: dto.email,
        workingHours: dto.workingHours,
        fpsId: dto.fpsId,
        bankAccountHolder: dto.bankAccountHolder,
        bankAccount: dto.bankAccount,
        apiTemplateSuffix: dto.apiTemplateSuffix,
        useWbaNumber: dto.useWbaNumber,
        buildingConfig: dto.buildingConfig,
        chequePaymentBy: dto.chequePaymentBy,
        paymentAdvice: dto.paymentAdvice,
        active: dto.active,
        updatedBy: actor || undefined,
      },
      include: { rooms: { select: { id: true } } },
    });
    return toBuildingDto(row);
  }
}
