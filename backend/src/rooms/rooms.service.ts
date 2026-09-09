import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toRoomDto } from '../common/dto-mappers';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { keyword?: string; buildingId?: string; status?: string }) {
    const q = params.keyword?.trim();
    const where: Prisma.RoomWhereInput = {};

    if (params.buildingId) where.buildingId = params.buildingId;
    if (params.status && Object.values(RoomStatus).includes(params.status as RoomStatus)) {
      where.status = params.status as RoomStatus;
    }
    if (q) {
      where.OR = [
        { roomCode: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { roomType: { contains: q, mode: 'insensitive' } },
        { serialNo: { contains: q, mode: 'insensitive' } },
        { building: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const rows = await this.prisma.room.findMany({
      where,
      include: { building: { select: { name: true } } },
      orderBy: { roomCode: 'asc' },
    });
    return rows.map(toRoomDto);
  }

  async findOne(id: string) {
    const row = await this.prisma.room.findUnique({
      where: { id },
      include: { building: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException(`Room ${id} not found`);
    return toRoomDto(row);
  }
}
