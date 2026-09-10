import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomTypeDto, UpdateRoomTypeDto } from './dto/room-type.dto';
import { roomTypeAuditInclude, toRoomTypeDto } from './room-type.mapper';

@Injectable()
export class RoomTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { activeOnly?: boolean }) {
    const where: Prisma.RoomTypeOptionWhereInput = {};
    if (params.activeOnly) where.active = true;

    const rows = await this.prisma.roomTypeOption.findMany({
      where,
      include: roomTypeAuditInclude,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toRoomTypeDto);
  }

  async findOne(id: string) {
    const row = await this.prisma.roomTypeOption.findUnique({
      where: { id },
      include: roomTypeAuditInclude,
    });
    if (!row) throw new NotFoundException(`Room type ${id} not found`);
    return toRoomTypeDto(row);
  }

  async create(dto: CreateRoomTypeDto, actor = '') {
    const label = dto.label.trim();
    if (!label) throw new BadRequestException('Label is required');
    const actorId = actor || null;

    try {
      const row = await this.prisma.roomTypeOption.create({
        data: {
          label,
          tone: dto.tone || 'other',
          hint: dto.hint?.trim() || '',
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
          createdById: actorId,
          updatedById: actorId,
        },
        include: roomTypeAuditInclude,
      });
      return toRoomTypeDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Room type「${label}」already exists`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateRoomTypeDto, actor = '') {
    const existing = await this.prisma.roomTypeOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Room type ${id} not found`);

    try {
      const row = await this.prisma.roomTypeOption.update({
        where: { id },
        data: {
          label: dto.label !== undefined ? dto.label.trim() : undefined,
          tone: dto.tone,
          hint: dto.hint !== undefined ? dto.hint.trim() : undefined,
          sortOrder: dto.sortOrder,
          active: dto.active,
          ...(actor ? { updatedById: actor } : {}),
        },
        include: roomTypeAuditInclude,
      });
      return toRoomTypeDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Room type「${dto.label?.trim()}」already exists`);
      }
      throw e;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.roomTypeOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Room type ${id} not found`);
    await this.prisma.roomTypeOption.delete({ where: { id } });
    return { success: true };
  }
}
