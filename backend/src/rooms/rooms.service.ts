import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { Prisma, RoomLeaseCapability, RoomStatus } from '@prisma/client';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { BuildingAccessService } from '../building-access/building-access.service';
import {
  isExternalRoomImageKey,
  roomImageStorageRel,
  roomListInclude,
  toRoomDto,
  toRoomImageDto,
} from '../common/dto-mappers';
import {
  dateRangeFilter,
  paginateArgs,
  parsePage,
  parsePageSize,
  parseSortDir,
  type PaginatedResult,
} from '../common/pagination';
import {
  numberFieldInOrEmpty,
  stringFieldInOrEmpty,
} from '../common/column-filter';
import { actorRelationInOrEmpty } from '../common/audit';
import {
  BatchUpdateRoomsDto,
  CreateRoomDto,
  ImportRoomsDto,
  UpdateRoomDto,
} from './dto/room.dto';
import { runBatchRemove } from '../common/batch-delete';
import { pushImportIssue, type ImportIssue } from '../common/import-result';
import {
  applyShortTermOccupancy,
  buildRoomOccupancy,
  dateInRange,
  dateOnlyYmd,
  defaultSplitLabels,
  isActiveShortTermInvoiceStatus,
  normalizeLeaseCapability,
  OCCUPYING_CONTRACT_STATUSES,
  resolveRoomLeaseFields,
  type RoomOccupancyDto,
  type ShortTermOccupancyHit,
} from '../common/room-lease';

function s(v?: string | null) {
  return (v ?? '').trim();
}

function n(v?: number | null) {
  if (v === null || v === undefined) return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function uploadsRoot() {
  return path.join(process.cwd(), 'uploads');
}

/** multer 文件名 UTF-8 修复（与单据模板一致） */
function decodeMulterFilename(name: string): string {
  const raw = s(name);
  if (!raw) return raw;
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    if (decoded.includes('\uFFFD')) return raw;
    const rawHasCjk = /[\u4e00-\u9fff]/.test(raw);
    const decodedHasCjk = /[\u4e00-\u9fff]/.test(decoded);
    if (!rawHasCjk && decodedHasCjk) return decoded;
    return raw;
  } catch {
    return raw;
  }
}

function safeImageFileName(original: string): string {
  const decoded = decodeMulterFilename(original) || 'image.jpg';
  const base = path.basename(decoded).replace(/[\\/]/g, '_');
  if (!base || base.includes('..')) {
    throw new BadRequestException('非法文件名');
  }
  return base;
}

function assertImageFile(file: Express.Multer.File) {
  if (!file?.buffer?.length) {
    throw new BadRequestException('请上传图片文件');
  }
  const fileName = safeImageFileName(file.originalname);
  const ext = path.extname(fileName).toLowerCase();
  const okExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(ext);
  const mime = (file.mimetype || '').toLowerCase();
  const okMime = !mime || mime.startsWith('image/');
  if (!okExt || !okMime) {
    throw new BadRequestException('仅支持图片文件（jpg/png/gif/webp 等）');
  }
  return { fileName, buffer: file.buffer, mime: mime || 'application/octet-stream' };
}

function mimeFromFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
  };
  return map[ext] || 'application/octet-stream';
}

function parseRoomStatuses(raw?: string[]): RoomStatus[] {
  if (!raw?.length) return [];
  return raw
    .map((v) => s(v))
    .filter((v): v is RoomStatus => Object.values(RoomStatus).includes(v as RoomStatus));
}

const OCCUPANCY_SUMMARIES = ['idle', 'whole', 'partial', 'full', 'short'] as const;
type OccupancySummary = (typeof OCCUPANCY_SUMMARIES)[number];

function parseOccupancySummaries(raw?: string[]): OccupancySummary[] {
  if (!raw?.length) return [];
  const set = new Set(OCCUPANCY_SUMMARIES);
  return [...new Set(raw.map((v) => s(v) as OccupancySummary).filter((v) => set.has(v)))];
}

const OCCUPANCY_SUMMARY_SORT_RANK: Record<OccupancySummary, number> = {
  idle: 0,
  short: 1,
  whole: 2,
  partial: 3,
  full: 4,
};

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BuildingAccessService,
  ) {}

  /** 校验当前用户是否可将房间归属到该大厦 */
  private async assertCanAssignBuilding(buildingId: string) {
    const allowed = await this.access.allowedIds();
    if (allowed == null) return;
    if (!allowed.includes(buildingId)) {
      throw new ForbiddenException('无权将该房间归属至该大厦');
    }
  }

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

  /** 按租赁能力统计数量（受大厦范围约束） */
  async countByLeaseCapability(params: { buildingId?: string; buildingIds?: string[] }) {
    const where = await this.buildListWhere({
      buildingId: params.buildingId,
      buildingIds: params.buildingIds,
    });
    await this.access.constrain(where, 'room');
    const rows = await this.prisma.room.groupBy({
      by: ['leaseCapability'],
      where,
      _count: { _all: true },
    });
    const counts = {
      all: 0,
      flexible: 0,
      whole_only: 0,
      part_only: 0,
    };
    for (const row of rows) {
      const n = row._count._all;
      counts.all += n;
      if (row.leaseCapability === 'flexible') counts.flexible = n;
      else if (row.leaseCapability === 'whole_only') counts.whole_only = n;
      else if (row.leaseCapability === 'part_only') counts.part_only = n;
    }
    return counts;
  }

  async findAll(params: {
    keyword?: string;
    buildingId?: string;
    buildingIds?: string[];
    status?: string;
    statuses?: string[];
    leaseCapability?: string;
    leaseCapabilities?: string[];
    roomCodes?: string[];
    names?: string[];
    monthlyRents?: string[];
    dailyRents?: string[];
    hourlyRents?: string[];
    /** 租用填充态：idle | whole | partial | full（状态列筛选） */
    occupancySummaries?: string[];
    roomTypes?: string[];
    sizeRangeIds?: string[];
    windowConfigs?: string[];
    acConfigs?: string[];
    /** 仅列出已开启「允许短租」的房间 */
    allowShortTerm?: boolean;
    createdBys?: string[];
    updatedBys?: string[];
    createdAtEmpty?: boolean;
    updatedAtEmpty?: boolean;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    createdAtFrom?: string;
    createdAtTo?: string;
    updatedAtFrom?: string;
    updatedAtTo?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<ReturnType<typeof toRoomDto>>> {
    const page = parsePage(params.page);
    const pageSize = parsePageSize(params.pageSize);
    const occupancySummaries = parseOccupancySummaries(params.occupancySummaries);
    const where = await this.buildListWhere({
      ...params,
      // 状态列改为按 occupancy.summary 筛选时，不再用 RoomStatus 生命周期过滤
      status: occupancySummaries.length ? undefined : params.status,
      statuses: occupancySummaries.length ? undefined : params.statuses,
    });
    await this.access.constrain(where, 'room');
    const { skip, take } = paginateArgs(page, pageSize);
    const orderBy = this.buildListOrderBy(params.sortBy, params.sortDir);
    const sortByStatus = s(params.sortBy) === 'status';

    // 按占用填充态筛选/排序时需先算 occupancy，再内存分页
    if (occupancySummaries.length || sortByStatus) {
      const rows = await this.prisma.room.findMany({
        where,
        include: roomListInclude,
        orderBy: sortByStatus ? [{ createdAt: 'desc' }, { roomCode: 'asc' }] : orderBy,
      });
      let items = await this.withOccupancy(rows.map(toRoomDto));
      if (occupancySummaries.length) {
        const allow = new Set(occupancySummaries);
        items = items.filter((r) => allow.has(r.occupancy.summary as OccupancySummary));
      }
      if (sortByStatus) {
        const dir = parseSortDir(params.sortDir) === 'desc' ? -1 : 1;
        items = [...items].sort((a, b) => {
          const ra = OCCUPANCY_SUMMARY_SORT_RANK[a.occupancy.summary as OccupancySummary] ?? 0;
          const rb = OCCUPANCY_SUMMARY_SORT_RANK[b.occupancy.summary as OccupancySummary] ?? 0;
          if (ra !== rb) return (ra - rb) * dir;
          return a.roomCode.localeCompare(b.roomCode, 'zh-Hant');
        });
      }
      const total = items.length;
      const paged =
        skip !== undefined && take !== undefined ? items.slice(skip, skip + take) : items;
      return {
        items: paged,
        total,
        page: pageSize == null ? 1 : page,
        pageSize: pageSize == null ? total : pageSize,
      };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.room.count({ where }),
      this.prisma.room.findMany({
        where,
        include: roomListInclude,
        orderBy,
        ...(skip !== undefined ? { skip, take } : {}),
      }),
    ]);

    const items = await this.withOccupancy(rows.map(toRoomDto));
    return {
      items,
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    };
  }

  private async withOccupancy<T extends { id: string; leaseCapability?: string; splitLabels?: string[] }>(
    items: T[],
  ): Promise<Array<T & { occupancy: RoomOccupancyDto }>> {
    if (!items.length) return [];
    const ids = items.map((r) => r.id);
    const asOf = dateOnlyYmd(new Date());
    const [contracts, shortInvoices] = await Promise.all([
      this.prisma.contract.findMany({
        where: {
          roomId: { in: ids },
          status: { in: [...OCCUPYING_CONTRACT_STATUSES] },
        },
        select: {
          id: true,
          roomId: true,
          contractCode: true,
          status: true,
          occupancyMode: true,
          partLabel: true,
          customer: { select: { name: true } },
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          roomId: { in: ids },
          source: 'short_term',
          status: { not: '已取消' },
          rentalStartDate: { not: null },
          rentalEndDate: { not: null },
        },
        select: {
          id: true,
          roomId: true,
          invoiceCode: true,
          shortTermRentalCode: true,
          status: true,
          rentalStartDate: true,
          rentalEndDate: true,
          customer: { select: { name: true } },
        },
      }),
    ]);
    const byRoom = new Map<string, typeof contracts>();
    for (const c of contracts) {
      const list = byRoom.get(c.roomId) || [];
      list.push(c);
      byRoom.set(c.roomId, list);
    }
    const shortByRoom = new Map<string, ShortTermOccupancyHit>();
    for (const inv of shortInvoices) {
      if (!isActiveShortTermInvoiceStatus(inv.status)) continue;
      if (!dateInRange(asOf, inv.rentalStartDate, inv.rentalEndDate)) continue;
      if (shortByRoom.has(inv.roomId)) continue;
      shortByRoom.set(inv.roomId, {
        invoiceId: inv.id,
        invoiceCode: inv.invoiceCode || inv.shortTermRentalCode || '',
        shortTermRentalCode: inv.shortTermRentalCode || undefined,
        customerName: inv.customer?.name,
        rentalStartDate: dateOnlyYmd(inv.rentalStartDate),
        rentalEndDate: dateOnlyYmd(inv.rentalEndDate),
      });
    }
    return items.map((room) => {
      const list = byRoom.get(room.id) || [];
      const base = buildRoomOccupancy(
        {
          leaseCapability: room.leaseCapability || 'flexible',
          splitLabels: room.splitLabels || [],
        },
        list.map((c) => ({
          id: c.id,
          contractCode: c.contractCode,
          status: c.status,
          occupancyMode: c.occupancyMode,
          partLabel: c.partLabel,
          customerName: c.customer?.name,
        })),
      );
      const occupancy = applyShortTermOccupancy(base, shortByRoom.get(room.id));
      return { ...room, occupancy };
    });
  }

  private async buildListWhere(params: {
    keyword?: string;
    buildingId?: string;
    buildingIds?: string[];
    status?: string;
    statuses?: string[];
    leaseCapability?: string;
    leaseCapabilities?: string[];
    roomCodes?: string[];
    names?: string[];
    monthlyRents?: string[];
    dailyRents?: string[];
    hourlyRents?: string[];
    roomTypes?: string[];
    sizeRangeIds?: string[];
    windowConfigs?: string[];
    acConfigs?: string[];
    allowShortTerm?: boolean;
    createdBys?: string[];
    updatedBys?: string[];
    createdAtEmpty?: boolean;
    updatedAtEmpty?: boolean;
    createdAtFrom?: string;
    createdAtTo?: string;
    updatedAtFrom?: string;
    updatedAtTo?: string;
  }): Promise<Prisma.RoomWhereInput> {
    const where: Prisma.RoomWhereInput = {};
    const and: Prisma.RoomWhereInput[] = [];

    if (params.allowShortTerm === true) where.allowShortTerm = true;
    else if (params.allowShortTerm === false) where.allowShortTerm = false;

    const buildingIds = [
      ...new Set(
        [...(params.buildingIds || []), params.buildingId || '']
          .map((v) => s(v))
          .filter(Boolean),
      ),
    ];
    if (buildingIds.length === 1) where.buildingId = buildingIds[0];
    else if (buildingIds.length > 1) where.buildingId = { in: buildingIds };

    const leaseCaps = [
      ...new Set(
        [...(params.leaseCapabilities || []), params.leaseCapability || '']
          .map((v) => s(v))
          .filter((v): v is 'whole_only' | 'flexible' | 'part_only' =>
            v === 'whole_only' || v === 'flexible' || v === 'part_only',
          ),
      ),
    ];
    if (leaseCaps.length === 1) where.leaseCapability = leaseCaps[0];
    else if (leaseCaps.length > 1) where.leaseCapability = { in: leaseCaps };

    const roomCodeClause = stringFieldInOrEmpty('roomCode', params.roomCodes);
    if (roomCodeClause) and.push(roomCodeClause as Prisma.RoomWhereInput);
    const nameClause = stringFieldInOrEmpty('name', params.names);
    if (nameClause) and.push(nameClause as Prisma.RoomWhereInput);

    const monthlyClause = numberFieldInOrEmpty('monthlyRent', params.monthlyRents);
    if (monthlyClause) and.push(monthlyClause as Prisma.RoomWhereInput);
    const dailyClause = numberFieldInOrEmpty('dailyRent', params.dailyRents);
    if (dailyClause) and.push(dailyClause as Prisma.RoomWhereInput);
    const hourlyClause = numberFieldInOrEmpty('hourlyRent', params.hourlyRents);
    if (hourlyClause) and.push(hourlyClause as Prisma.RoomWhereInput);

    const statuses = [
      ...parseRoomStatuses(params.statuses),
      ...parseRoomStatuses(params.status ? [params.status] : undefined),
    ];
    const uniqStatuses = [...new Set(statuses)];
    if (uniqStatuses.length === 1) where.status = uniqStatuses[0];
    else if (uniqStatuses.length > 1) where.status = { in: uniqStatuses };

    const roomTypeClause = stringFieldInOrEmpty('roomType', params.roomTypes);
    if (roomTypeClause) and.push(roomTypeClause as Prisma.RoomWhereInput);
    const windowClause = stringFieldInOrEmpty('windowConfig', params.windowConfigs);
    if (windowClause) and.push(windowClause as Prisma.RoomWhereInput);
    const acClause = stringFieldInOrEmpty('acConfig', params.acConfigs);
    if (acClause) and.push(acClause as Prisma.RoomWhereInput);

    const createdByClause = actorRelationInOrEmpty(
      'createdByUser',
      'createdById',
      params.createdBys,
    );
    if (createdByClause) and.push(createdByClause as Prisma.RoomWhereInput);
    const updatedByClause = actorRelationInOrEmpty(
      'updatedByUser',
      'updatedById',
      params.updatedBys,
    );
    if (updatedByClause) and.push(updatedByClause as Prisma.RoomWhereInput);

    const sizeRangeIds = (params.sizeRangeIds || []).map((v) => s(v)).filter(Boolean);
    if (sizeRangeIds.length) {
      const ranges = await this.prisma.roomConfigOption.findMany({
        where: { id: { in: sizeRangeIds }, type: 'size' },
        select: { minSqft: true, maxSqft: true },
      });
      if (ranges.length) {
        and.push({
          OR: ranges.map((r) => {
            const sizeSqft: Prisma.DecimalFilter = {};
            if (r.minSqft != null) sizeSqft.gte = r.minSqft;
            if (r.maxSqft != null) sizeSqft.lt = r.maxSqft;
            return { sizeSqft };
          }),
        });
      } else {
        and.push({ id: '__no_match__' });
      }
    }

    const keyword = params.keyword?.trim();
    if (keyword) {
      and.push({
        OR: [
          { roomCode: { contains: keyword, mode: 'insensitive' } },
          { name: { contains: keyword, mode: 'insensitive' } },
          { roomType: { contains: keyword, mode: 'insensitive' } },
          { serialNo: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
          { building: { name: { contains: keyword, mode: 'insensitive' } } },
        ],
      });
    }

    // createdAt/updatedAt 为必填时间戳，空值筛选无匹配行（仍接受参数以免前端报错）
    if (params.createdAtEmpty) {
      and.push({ id: '__no_match__' });
    } else {
      const createdAt = dateRangeFilter(params.createdAtFrom, params.createdAtTo, true);
      if (createdAt) where.createdAt = createdAt;
    }
    if (params.updatedAtEmpty) {
      and.push({ id: '__no_match__' });
    } else {
      const updatedAt = dateRangeFilter(params.updatedAtFrom, params.updatedAtTo, true);
      if (updatedAt) where.updatedAt = updatedAt;
    }

    if (and.length) where.AND = and;
    return where;
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.RoomOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'asc';
    const key = s(sortBy);
    // 未指定排序：最新创建的在前
    if (!key) return [{ createdAt: 'desc' }, { roomCode: 'asc' }];
    if (key === 'roomCode') return [{ roomCode: dir }];
    if (key === 'name') return [{ name: dir }, { roomCode: 'asc' }];
    if (key === 'roomType') return [{ roomType: dir }, { roomCode: 'asc' }];
    if (key === 'buildingId' || key === 'buildingName') {
      return [{ building: { name: dir } }, { roomCode: 'asc' }];
    }
    if (key === 'status') return [{ status: dir }, { roomCode: 'asc' }];
    if (key === 'leaseCapability') return [{ leaseCapability: dir }, { roomCode: 'asc' }];
    if (key === 'monthlyRent') return [{ monthlyRent: dir }];
    if (key === 'dailyRent') return [{ dailyRent: dir }];
    if (key === 'hourlyRent') return [{ hourlyRent: dir }];
    if (key === 'sizeSqft' || key === 'sizeRange') return [{ sizeSqft: dir }];
    if (key === 'windowConfig') return [{ windowConfig: dir }, { roomCode: 'asc' }];
    if (key === 'acConfig') return [{ acConfig: dir }, { roomCode: 'asc' }];
    if (key === 'contractCount') return [{ contracts: { _count: dir } }, { roomCode: 'asc' }];
    if (key === 'invoiceCount') return [{ invoices: { _count: dir } }, { roomCode: 'asc' }];
    if (key === 'terminationCount') {
      return [{ leaseTerminations: { _count: dir } }, { roomCode: 'asc' }];
    }
    if (key === 'depositRefundCount') {
      return [{ depositRefunds: { _count: dir } }, { roomCode: 'asc' }];
    }
    if (key === 'createdAt') return [{ createdAt: dir }];
    if (key === 'updatedAt') return [{ updatedAt: dir }];
    if (key === 'createdBy') {
      return [
        { createdByUser: { displayName: dir } },
        { createdByUser: { account: dir } },
        { roomCode: 'asc' },
      ];
    }
    if (key === 'updatedBy') {
      return [
        { updatedByUser: { displayName: dir } },
        { updatedByUser: { account: dir } },
        { roomCode: 'asc' },
      ];
    }
    return [{ roomCode: 'asc' }];
  }

  async findOne(id: string) {
    const row = await this.prisma.room.findUnique({
      where: { id },
      include: roomListInclude,
    });
    if (!row) throw new NotFoundException(`Room ${id} not found`);
    await this.access.assertBuildingId(row.buildingId);
    const [dtoRow] = await this.withOccupancy([toRoomDto(row)]);
    return dtoRow;
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
    await this.assertCanAssignBuilding(building.id);

    const lease = resolveRoomLeaseFields({
      roomCode,
      leaseCapability: dto.leaseCapability,
      splitLabels: dto.splitLabels,
      splitCount: dto.splitCount,
      subleaseMark: dto.subleaseMark,
    });

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
          subleaseMark: lease.subleaseMark,
          leaseCapability: lease.leaseCapability,
          splitLabels: lease.splitLabels,
          allowShortTerm: dto.allowShortTerm === true,
          createdById: actorId,
          updatedById: actorId,
        },
        include: roomListInclude,
      });
      const [dtoRow] = await this.withOccupancy([toRoomDto(row)]);
      return dtoRow;
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
    await this.access.assertBuildingId(existing.buildingId);

    let buildingId = existing.buildingId;
    if (dto.buildingId !== undefined || dto.buildingName !== undefined) {
      const building = await this.resolveBuilding({
        buildingId: dto.buildingId,
        buildingName: dto.buildingName,
      });
      if (!building) throw new BadRequestException('building not found');
      await this.assertCanAssignBuilding(building.id);
      buildingId = building.id;
    }

    const nextCode = dto.roomCode !== undefined ? s(dto.roomCode) : existing.roomCode;
    const touchLease =
      dto.leaseCapability !== undefined ||
      dto.splitLabels !== undefined ||
      dto.splitCount !== undefined ||
      dto.subleaseMark !== undefined ||
      dto.roomCode !== undefined;
    const lease = touchLease
      ? resolveRoomLeaseFields({
          roomCode: nextCode,
          leaseCapability: dto.leaseCapability ?? existing.leaseCapability,
          splitLabels: dto.splitLabels ?? existing.splitLabels,
          splitCount: dto.splitCount,
          subleaseMark:
            dto.subleaseMark !== undefined ? dto.subleaseMark : existing.subleaseMark,
        })
      : null;

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
          ...(lease
            ? {
                subleaseMark: lease.subleaseMark,
                leaseCapability: lease.leaseCapability,
                splitLabels: lease.splitLabels,
              }
            : dto.subleaseMark !== undefined
              ? { subleaseMark: s(dto.subleaseMark) || null }
              : {}),
          ...(dto.allowShortTerm !== undefined
            ? { allowShortTerm: dto.allowShortTerm === true }
            : {}),
          ...(actor ? { updatedById: actor } : {}),
        },
        include: roomListInclude,
      });
      const [dtoRow] = await this.withOccupancy([toRoomDto(row)]);
      return dtoRow;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Room code「${s(dto.roomCode)}」already exists`);
      }
      throw e;
    }
  }

  /** 按房间编号 upsert；按本批 roomCode / 大厦 ID·名称 范围加载已有行 */
  async importBatch(dto: ImportRoomsDto, actor = '') {
    const items = dto.items || [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let unlinked = 0;
    let failed = 0;
    const issues: ImportIssue[] = [];

    const codes = [...new Set(items.map((it) => s(it.roomCode)).filter(Boolean))];
    const existingRows = codes.length
      ? await this.prisma.room.findMany({
          where: { roomCode: { in: codes } },
          select: { id: true, roomCode: true },
        })
      : [];
    const byCode = new Map(existingRows.map((r) => [r.roomCode, r]));

    const buildingIds = [...new Set(items.map((it) => s(it.buildingId)).filter(Boolean))];
    const buildingNames = [
      ...new Set(items.map((it) => s(it.buildingName)).filter(Boolean)),
    ];
    const buildings =
      buildingIds.length || buildingNames.length
        ? await this.prisma.building.findMany({
            where: {
              OR: [
                ...(buildingIds.length ? [{ id: { in: buildingIds } }] : []),
                ...buildingNames.map((name) => ({
                  name: { equals: name, mode: 'insensitive' as const },
                })),
              ],
            },
            select: { id: true, name: true },
          })
        : [];
    const byBuildingId = new Map(buildings.map((b) => [b.id, b]));
    const byBuildingName = new Map(
      buildings.map((b) => [b.name.trim().toLowerCase(), b]),
    );

    for (const item of items) {
      const roomCode = s(item.roomCode);
      const name = s(item.name) || roomCode;
      const buildingId = s(item.buildingId);
      const buildingName = s(item.buildingName);
      const keys = {
        房間編號: roomCode,
        房間名稱: name,
        大廈名稱: buildingName,
        大廈ID: buildingId,
      };

      if (!roomCode) {
        skipped += 1;
        pushImportIssue(issues, 'skipped', '缺少房間編號', keys);
        continue;
      }

      const building =
        (buildingId ? byBuildingId.get(buildingId) : undefined) ||
        (buildingName ? byBuildingName.get(buildingName.toLowerCase()) : undefined);

      if (!building) {
        unlinked += 1;
        pushImportIssue(
          issues,
          'unlinked',
          buildingId
            ? `大廈 ID「${buildingId}」未找到`
            : buildingName
              ? `大廈「${buildingName}」未找到`
              : '缺少大廈名稱或 ID，無法關聯',
          keys,
        );
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
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : '建立或更新房間失敗';
        pushImportIssue(issues, 'failed', msg, keys);
      }
    }

    return { created, updated, skipped, unlinked, failed, issues };
  }

  async remove(id: string) {
    const existing = await this.prisma.room.findUnique({
      where: { id },
      include: {
        _count: {
          select: { contracts: true, leaseTerminations: true },
        },
        images: true,
      },
    });
    if (!existing) throw new NotFoundException(`Room ${id} not found`);
    await this.access.assertBuildingId(existing.buildingId);
    if (existing._count.contracts > 0 || existing._count.leaseTerminations > 0) {
      throw new ConflictException(
        `Room「${existing.roomCode}」仍有關聯合約或退租記錄，無法刪除`,
      );
    }
    await this.prisma.room.delete({ where: { id } });
    for (const img of existing.images) {
      await this.removeStoredImageFile(img.storageKey);
    }
    await this.removeRoomImageDir(id);
    return { success: true };
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }

  /** 批量修改房间字段（仅 SuperAdmin 入口调用；仅提交字段会更新） */
  async batchUpdate(dto: BatchUpdateRoomsDto, actor = '') {
    const ids = [
      ...new Set((dto.ids || []).map((id) => s(id)).filter(Boolean)),
    ];
    if (!ids.length) {
      throw new BadRequestException('请至少选择一个房间');
    }

    const data: Prisma.RoomUncheckedUpdateManyInput = {};
    if (dto.allowShortTerm !== undefined) {
      data.allowShortTerm = dto.allowShortTerm === true;
    }
    if (dto.roomType !== undefined) {
      data.roomType = s(dto.roomType);
    }
    if (dto.windowConfig !== undefined) {
      data.windowConfig = s(dto.windowConfig) || null;
    }
    if (dto.acConfig !== undefined) {
      data.acConfig = s(dto.acConfig) || null;
    }
    if (dto.monthlyRent !== undefined) data.monthlyRent = n(dto.monthlyRent);
    if (dto.dailyRent !== undefined) data.dailyRent = n(dto.dailyRent);
    if (dto.hourlyRent !== undefined) data.hourlyRent = n(dto.hourlyRent);
    if (dto.sizeSqft !== undefined) data.sizeSqft = n(dto.sizeSqft);
    if (dto.description !== undefined) {
      data.description = s(dto.description) || null;
    }
    if (dto.remark !== undefined) {
      data.remark = s(dto.remark) || null;
    }

    if (dto.buildingId !== undefined) {
      const buildingId = s(dto.buildingId);
      if (!buildingId) throw new BadRequestException('请选择所属大厦');
      await this.access.assertBuildingId(buildingId);
      const building = await this.prisma.building.findUnique({
        where: { id: buildingId },
        select: { id: true },
      });
      if (!building) throw new BadRequestException('大厦不存在');
      data.buildingId = buildingId;
    }

    if (dto.leaseCapability !== undefined) {
      const cap = normalizeLeaseCapability(dto.leaseCapability);
      data.leaseCapability = cap;
      if (
        cap === RoomLeaseCapability.whole_only ||
        cap === RoomLeaseCapability.part_only
      ) {
        data.splitLabels = [];
      } else {
        const count =
          dto.splitCount != null && Number.isFinite(Number(dto.splitCount))
            ? Math.max(2, Math.min(12, Math.floor(Number(dto.splitCount))))
            : 2;
        data.splitLabels = defaultSplitLabels(count);
      }
    }

    // updatedById 不算业务字段
    const businessKeys = Object.keys(data);
    if (!businessKeys.length) {
      throw new BadRequestException('请至少指定一个要修改的字段');
    }
    if (actor) data.updatedById = actor;

    const where: Prisma.RoomWhereInput = { id: { in: ids } };
    await this.access.constrain(where, 'room');

    const result = await this.prisma.room.updateMany({ where, data });
    return { updated: result.count, requested: ids.length };
  }

  private absPath(storageKey: string) {
    // 旧路径可能带前导 /；path.join 遇绝对段会丢掉 uploads 根，须先规范化
    const rel = roomImageStorageRel(storageKey);
    if (!rel || rel.includes('..')) {
      throw new BadRequestException('非法图片路径');
    }
    return path.join(uploadsRoot(), rel);
  }

  private storageKeyForRoomImage(roomId: string, fileName: string) {
    const id = s(roomId);
    const base = path.basename(s(fileName));
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      throw new BadRequestException('非法房间 ID');
    }
    if (!base || base.includes('..') || base.includes('/') || base.includes('\\')) {
      throw new BadRequestException('非法文件名');
    }
    const unique = `${Date.now()}_${base}`;
    return `rooms/${id}/${unique}`;
  }

  private async removeStoredImageFile(storageKey: string) {
    if (!storageKey || isExternalRoomImageKey(storageKey)) return;
    const abs = this.absPath(storageKey);
    await fs.rm(abs, { force: true }).catch(() => undefined);
  }

  private async removeRoomImageDir(roomId: string) {
    const dir = path.join(uploadsRoot(), 'rooms', roomId);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }

  async uploadImages(roomId: string, files: Express.Multer.File[], actor = '') {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException(`Room ${roomId} not found`);
    await this.access.assertBuildingId(room.buildingId);
    if (!files?.length) throw new BadRequestException('请至少上传一张图片');

    const maxSort = await this.prisma.roomImage.aggregate({
      where: { roomId },
      _max: { sortOrder: true },
    });
    let nextSort = (maxSort._max.sortOrder ?? -1) + 1;
    const actorId = actor || null;
    const created = [];

    for (const file of files) {
      const { fileName, buffer } = assertImageFile(file);
      const storageKey = this.storageKeyForRoomImage(roomId, fileName);
      const abs = this.absPath(storageKey);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, buffer);
      const row = await this.prisma.roomImage.create({
        data: {
          roomId,
          fileName,
          storageKey,
          sortOrder: nextSort++,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      created.push(toRoomImageDto(row));
    }
    return created;
  }

  async removeImage(roomId: string, imageId: string) {
    const row = await this.prisma.roomImage.findFirst({
      where: { id: imageId, roomId },
    });
    if (!row) throw new NotFoundException(`Room image ${imageId} not found`);
    await this.access.assertRoomId(roomId);
    await this.prisma.roomImage.delete({ where: { id: imageId } });
    await this.removeStoredImageFile(row.storageKey);
    return { success: true };
  }

  async getImageFile(roomId: string, imageId: string): Promise<StreamableFile> {
    const row = await this.prisma.roomImage.findFirst({
      where: { id: imageId, roomId },
    });
    if (!row) throw new NotFoundException(`Room image ${imageId} not found`);
    await this.access.assertRoomId(roomId);
    if (isExternalRoomImageKey(row.storageKey)) {
      throw new BadRequestException('该图片为外部地址，请直接使用 publicUrl');
    }
    const abs = this.absPath(row.storageKey);
    try {
      await fs.access(abs);
    } catch {
      throw new NotFoundException('图片文件不存在');
    }
    const stream = createReadStream(abs);
    return new StreamableFile(stream, {
      type: mimeFromFileName(row.fileName),
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
    });
  }
}
