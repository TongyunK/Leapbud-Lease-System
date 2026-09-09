import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoomConfigType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomConfigDto, UpdateRoomConfigDto } from './dto/room-config.dto';
import { buildSizeLabel, toRoomConfigDto } from './room-config.mapper';

@Injectable()
export class RoomConfigsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { type?: string; activeOnly?: boolean }) {
    const where: Prisma.RoomConfigOptionWhereInput = {};
    if (params.type && Object.values(RoomConfigType).includes(params.type as RoomConfigType)) {
      where.type = params.type as RoomConfigType;
    }
    if (params.activeOnly) where.active = true;

    const rows = await this.prisma.roomConfigOption.findMany({
      where,
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toRoomConfigDto);
  }

  async findOne(id: string) {
    const row = await this.prisma.roomConfigOption.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Config ${id} not found`);
    return toRoomConfigDto(row);
  }

  async create(dto: CreateRoomConfigDto) {
    const label = this.resolveLabel(dto.type, dto.label, dto.minSqft, dto.maxSqft);
    if (!label) throw new BadRequestException('Label is required');

    const row = await this.prisma.roomConfigOption.create({
      data: {
        type: dto.type,
        label,
        minSqft: dto.type === RoomConfigType.size ? dto.minSqft ?? null : null,
        maxSqft: dto.type === RoomConfigType.size ? dto.maxSqft ?? null : null,
        brand: dto.brand?.trim() || '',
        model: dto.model?.trim() || '',
        sortOrder: dto.sortOrder ?? 0,
        active: dto.active ?? true,
      },
    });
    return toRoomConfigDto(row);
  }

  async update(id: string, dto: UpdateRoomConfigDto) {
    const existing = await this.prisma.roomConfigOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Config ${id} not found`);

    const minSqft =
      dto.minSqft !== undefined ? dto.minSqft : decimalOrNull(existing.minSqft);
    const maxSqft =
      dto.maxSqft !== undefined ? dto.maxSqft : decimalOrNull(existing.maxSqft);

    let label = dto.label?.trim();
    if (existing.type === RoomConfigType.size && !label) {
      if (dto.minSqft !== undefined || dto.maxSqft !== undefined) {
        label = buildSizeLabel(minSqft, maxSqft) || existing.label;
      }
    }

    const row = await this.prisma.roomConfigOption.update({
      where: { id },
      data: {
        label: label || undefined,
        minSqft: existing.type === RoomConfigType.size ? minSqft : null,
        maxSqft: existing.type === RoomConfigType.size ? maxSqft : null,
        brand: dto.brand !== undefined ? dto.brand.trim() : undefined,
        model: dto.model !== undefined ? dto.model.trim() : undefined,
        sortOrder: dto.sortOrder,
        active: dto.active,
      },
    });
    return toRoomConfigDto(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.roomConfigOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Config ${id} not found`);
    await this.prisma.roomConfigOption.delete({ where: { id } });
    return { success: true };
  }

  private resolveLabel(
    type: RoomConfigType,
    label: string | undefined,
    minSqft?: number | null,
    maxSqft?: number | null,
  ) {
    const trimmed = label?.trim();
    if (trimmed) return trimmed;
    if (type === RoomConfigType.size) return buildSizeLabel(minSqft, maxSqft);
    return '';
  }
}

function decimalOrNull(value: Prisma.Decimal | null): number | null {
  if (value == null) return null;
  return Number(value.toString());
}
