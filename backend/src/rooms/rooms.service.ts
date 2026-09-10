import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { roomListInclude, toRoomDto } from '../common/dto-mappers';
import { CreateRoomDto, ImportRoomsDto, UpdateRoomDto } from './dto/room.dto';

function s(v?: string | null) {
  return (v ?? '').trim();
}

function n(v?: number | null) {
  if (v === null || v === undefined) return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveBuilding(params: {
    buildingId?: string | null;
    buildingName?: string;
  }) {
    const buildingId = s(params.buildingId || undefined);
    const buildingName = s(params.buildingName);
    if (buildingId) {
      const b = await this.prisma.building.findUnique({ where: { id: buildingId } });
      if (!b) throw new NotFoundException(`Building ${buildingId} not found`);
      return b;
    }
    if (buildingName) {
      const rows = await this.prisma.building.findMany({
        where: { name: { equals: buildingName, mode: 'insensitive' } },
        take: 2,
      });
      if (rows.length === 1) return rows[0];
      if (rows.length > 1) {
        throw new BadRequestException(`Building name「${buildingName}」不唯一`);
      }
      return null;
    }
    return null;
  }

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
      include: roomListInclude,
      orderBy: { roomCode: 'asc' },
    });
    return rows.map(toRoomDto);
  }

  async findOne(id: string) {
    const row = await this.prisma.room.findUnique({
      where: { id },
      include: roomListInclude,
    });
    if (!row) throw new NotFoundException(`Room ${id} not found`);
    return toRoomDto(row);
  }

  async create(dto: CreateRoomDto, actor = '') {
    const roomCode = s(dto.roomCode);
    const name = s(dto.name);
    if (!roomCode) throw new BadRequestException('roomCode is required');
    if (!name) throw new BadRequestException('name is required');

    const building = await this.resolveBuilding({
      buildingId: dto.buildingId,
      buildingName: dto.buildingName,
    });
    if (!building) throw new BadRequestException('buildingId or buildingName is required');

    const actorId = actor || null;
    try {
      const row = await this.prisma.room.create({
        data: {
          roomCode,
          name,
          roomType: s(dto.roomType),
          buildingId: building.id,
          status: dto.status || RoomStatus.idle,
          serialNo: s(dto.serialNo) || roomCode,
          monthlyRent: n(dto.monthlyRent),
          dailyRent: n(dto.dailyRent),
          hourlyRent: n(dto.hourlyRent),
          sizeSqft: n(dto.sizeSqft),
          description: s(dto.description) || null,
          remark: s(dto.remark) || null,
          windowConfig: s(dto.windowConfig) || null,
          acConfig: s(dto.acConfig) || null,
          latestContract: s(dto.latestContract) || null,
          subleaseMark: s(dto.subleaseMark) || null,
          createdById: actorId,
          updatedById: actorId,
        },
        include: roomListInclude,
      });
      return toRoomDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Room code「${roomCode}」already exists`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateRoomDto, actor = '') {
    const existing = await this.prisma.room.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Room ${id} not found`);

    let buildingId = existing.buildingId;
    if (dto.buildingId !== undefined || dto.buildingName !== undefined) {
      const building = await this.resolveBuilding({
        buildingId: dto.buildingId,
        buildingName: dto.buildingName,
      });
      if (!building) throw new BadRequestException('building not found');
      buildingId = building.id;
    }

    try {
      const row = await this.prisma.room.update({
        where: { id },
        data: {
          roomCode: dto.roomCode !== undefined ? s(dto.roomCode) : undefined,
          name: dto.name !== undefined ? s(dto.name) : undefined,
          roomType: dto.roomType !== undefined ? s(dto.roomType) : undefined,
          buildingId,
          status: dto.status,
          serialNo: dto.serialNo !== undefined ? s(dto.serialNo) : undefined,
          monthlyRent: dto.monthlyRent !== undefined ? n(dto.monthlyRent) : undefined,
          dailyRent: dto.dailyRent !== undefined ? n(dto.dailyRent) : undefined,
          hourlyRent: dto.hourlyRent !== undefined ? n(dto.hourlyRent) : undefined,
          sizeSqft: dto.sizeSqft !== undefined ? n(dto.sizeSqft) : undefined,
          description:
            dto.description !== undefined ? s(dto.description) || null : undefined,
          remark: dto.remark !== undefined ? s(dto.remark) || null : undefined,
          windowConfig:
            dto.windowConfig !== undefined ? s(dto.windowConfig) || null : undefined,
          acConfig: dto.acConfig !== undefined ? s(dto.acConfig) || null : undefined,
          latestContract:
            dto.latestContract !== undefined ? s(dto.latestContract) || null : undefined,
          subleaseMark:
            dto.subleaseMark !== undefined ? s(dto.subleaseMark) || null : undefined,
          ...(actor ? { updatedById: actor } : {}),
        },
        include: roomListInclude,
      });
      return toRoomDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Room code「${s(dto.roomCode)}」already exists`);
      }
      throw e;
    }
  }

  /** 按房间编号 upsert；按大厦名称/ID 关联 */
  async importBatch(dto: ImportRoomsDto, actor = '') {
    const items = dto.items || [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let unlinked = 0;
    let failed = 0;

    const codes = [...new Set(items.map((it) => s(it.roomCode)).filter(Boolean))];
    const existingRows = codes.length
      ? await this.prisma.room.findMany({
          where: { roomCode: { in: codes } },
          select: { id: true, roomCode: true },
        })
      : [];
    const byCode = new Map(existingRows.map((r) => [r.roomCode, r]));

    const buildings = await this.prisma.building.findMany({
      select: { id: true, name: true },
    });
    const byBuildingId = new Map(buildings.map((b) => [b.id, b]));
    const byBuildingName = new Map(
      buildings.map((b) => [b.name.trim().toLowerCase(), b]),
    );

    for (const item of items) {
      const roomCode = s(item.roomCode);
      const name = s(item.name) || roomCode;
      if (!roomCode) {
        skipped += 1;
        continue;
      }

      const buildingId = s(item.buildingId);
      const buildingName = s(item.buildingName);
      let building =
        (buildingId ? byBuildingId.get(buildingId) : undefined) ||
        (buildingName ? byBuildingName.get(buildingName.toLowerCase()) : undefined);

      if (!building) {
        unlinked += 1;
        continue;
      }

      try {
        const hit = byCode.get(roomCode);
        const payload: CreateRoomDto = {
          ...item,
          roomCode,
          name,
          buildingId: building.id,
          buildingName: building.name,
        };
        if (hit) {
          await this.update(hit.id, payload, actor);
          updated += 1;
        } else {
          const row = await this.create(payload, actor);
          byCode.set(roomCode, { id: row.id, roomCode });
          created += 1;
        }
      } catch {
        failed += 1;
      }
    }

    return { created, updated, skipped, unlinked, failed };
  }
}
