import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoomLeaseCapability, RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BuildingAccessService } from '../building-access/building-access.service';
import {
  CreateContractDto,
  ContractOtherFeeInputDto,
  ContractPeriodInputDto,
  UpdateContractDto,
  ImportContractsDto,
  OpenContractOrderDto,
} from './dto/contract.dto';
import { contractInclude, toContractDto } from './contract.mapper';
import { ContractConfigsService } from '../contract-configs/contract-configs.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { InvoiceAutoService } from '../invoices/invoice-auto.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import type { ContractExpiringSoonConfig } from '../system-settings/system-settings.constants';
import { userWhereActorLabels } from '../common/audit';
import {
  dateRangeFilter,
  paginateArgs,
  parsePage,
  parsePageSize,
  parseSortDir,
  type PaginatedResult,
} from '../common/pagination';
import { runBatchRemove } from '../common/batch-delete';
import { pushImportIssue, type ImportIssue } from '../common/import-result';
import {
  OCCUPYING_CONTRACT_STATUSES,
  aggregateRoomStatus,
  buildRoomOccupancy,
  contractCodeRoomBase,
  normalizeOccupancyMode,
  normalizeSplitLabels,
} from '../common/room-lease';
import {
  formatDateYmd,
  listBillingPeriods,
  parsePaymentCycleMonths,
  rentBillingStartDate,
} from '../common/billing-period';
import { isSuperAdminRole } from '../common/actor-role';

/** 仍属签约流程、尚未开单为「租賃中」的状态（含历史归并态） */
const SIGNING_STATUSES_FOR_ISSUE_ALERT = ['簽約中', '已簽約', '草稿', '交吉中'] as const;

export type IssueBlockedAlertItem = {
  id: string;
  contractCode: string;
  secondPeriodStart: string;
  /** 距第 2 期开始的天数；负数表示已过开始日（越紧急越小） */
  daysUntilSecond: number;
  roomCode: string;
  customerName: string;
};

export type IssueBlockedAlertResult = {
  leadDays: number;
  total: number;
  items: IssueBlockedAlertItem[];
};

const ALLOWED_STATUSES = new Set([
  '簽約中',
  '租賃中',
  '退租中',
  '已退租',
  '已取消',
  '已續約',
]);

const STATUS_ALIASES: Record<string, string> = {
  // 已下线状态写入时归并到现行状态
  草稿: '簽約中',
  draft: '簽約中',
  已簽約: '簽約中',
  已签约: '簽約中',
  signed: '簽約中',
  交吉中: '簽約中',
  已完成: '已退租',
  completed: '已退租',
  簽約中: '簽約中',
  签约中: '簽約中',
  signing: '簽約中',
  租賃中: '租賃中',
  租赁中: '租賃中',
  leased: '租賃中',
  退租中: '退租中',
  terminating: '退租中',
  已退租: '已退租',
  terminated: '已退租',
  已取消: '已取消',
  cancelled: '已取消',
  canceled: '已取消',
  已續約: '已續約',
  已续约: '已續約',
  renewed: '已續約',
};

const ALLOWED_PERIOD_UNITS = new Set(['月', '日']);
const PERIOD_UNIT_ALIASES: Record<string, string> = {
  月: '月',
  个月: '月',
  個月: '月',
  month: '月',
  months: '月',
  日: '日',
  天: '日',
  day: '日',
  days: '日',
};

/** 合约状态 → 房间状态（保存时同步；含历史状态以便占用聚合） */
const ROOM_STATUS_BY_CONTRACT: Record<string, RoomStatus> = {
  草稿: RoomStatus.idle,
  簽約中: RoomStatus.signing,
  已簽約: RoomStatus.signing,
  交吉中: RoomStatus.signing,
  租賃中: RoomStatus.leased,
  已續約: RoomStatus.leased,
  退租中: RoomStatus.terminating,
  已退租: RoomStatus.idle,
  已完成: RoomStatus.idle,
  已取消: RoomStatus.idle,
};

function s(v: string | null | undefined) {
  return (v ?? '').trim();
}

function parseDateOnly(v: string | null | undefined, field: string): Date | null {
  const raw = s(v);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`);
  }
  return new Date(`${raw}T00:00:00.000Z`);
}

function nullId(v: string | null | undefined): string | null {
  const t = s(v);
  return t || null;
}

function numOrNull(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Number(v);
}

function decimalField(v: number, field: string): Prisma.Decimal {
  const n = Number(v);
  if (Number.isNaN(n)) throw new BadRequestException(`${field} must be a number`);
  return new Prisma.Decimal(n);
}

function feeSubtotal(
  quantity: Prisma.Decimal,
  unitAmount: Prisma.Decimal,
  subtotal?: number | null,
): Prisma.Decimal {
  if (subtotal != null && !Number.isNaN(Number(subtotal))) {
    return decimalField(subtotal, 'subtotal');
  }
  return new Prisma.Decimal(Number(quantity.toString()) * Number(unitAmount.toString()));
}

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractConfigs: ContractConfigsService,
    private readonly access: BuildingAccessService,
    private readonly receipts: ReceiptsService,
    private readonly invoiceAuto: InvoiceAutoService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  /**
   * 紧急待开单：签约中且已进入第 2 缴费期提前窗的合约（不受列表分页限制）。
   * 按第 2 期开始日升序（越早 / 越过期越紧急）。受当前大厦筛选与权限约束。
   */
  async listIssueBlockedAlerts(): Promise<IssueBlockedAlertResult> {
    const leadDays = await this.systemSettings.getRentInvoiceLeadDays();
    const where: Prisma.ContractWhereInput = {
      status: { in: [...SIGNING_STATUSES_FOR_ISSUE_ALERT] },
      startDate: { not: null },
      endDate: { not: null },
    };
    await this.access.constrain(where, 'viaRoom');

    const rows = await this.prisma.contract.findMany({
      where,
      select: {
        id: true,
        contractCode: true,
        startDate: true,
        endDate: true,
        paymentCycle: true,
        room: { select: { roomCode: true } },
        customer: { select: { name: true } },
        periods: {
          select: { dateType: true, startDate: true, endDate: true, sortOrder: true },
          orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }],
        },
      },
    });

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const items: IssueBlockedAlertItem[] = [];

    for (const c of rows) {
      const billingStart = rentBillingStartDate(c.startDate, c.periods);
      const months = parsePaymentCycleMonths(c.paymentCycle);
      const periods = listBillingPeriods(billingStart, c.endDate, months);
      const second = periods[1];
      if (!second) continue;
      const windowOpen = new Date(second.start.getTime() - leadDays * 24 * 60 * 60 * 1000);
      if (today.getTime() < windowOpen.getTime()) continue;
      const daysUntilSecond = Math.round(
        (second.start.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
      );
      items.push({
        id: c.id,
        contractCode: c.contractCode,
        secondPeriodStart: formatDateYmd(second.start),
        daysUntilSecond,
        roomCode: c.room?.roomCode || '',
        customerName: c.customer?.name || '',
      });
    }

    items.sort((a, b) => {
      if (a.daysUntilSecond !== b.daysUntilSecond) return a.daysUntilSecond - b.daysUntilSecond;
      return a.contractCode.localeCompare(b.contractCode, 'zh-Hant');
    });

    return { leadDays, total: items.length, items };
  }

  /** 按大厦聚合合约数量（一次 GROUP BY，供筛选下拉展示） */
  async countByBuilding(): Promise<Array<{ buildingId: string; count: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ building_id: string; count: bigint }>>`
      SELECT r."building_id" AS building_id, COUNT(c."id")::bigint AS count
      FROM "contracts" c
      INNER JOIN "rooms" r ON r."id" = c."room_id"
      WHERE r."building_id" IS NOT NULL
      GROUP BY r."building_id"
    `;
    const allowed = await this.access.allowedIds();
    return rows
      .filter((r) => allowed == null || allowed.includes(r.building_id))
      .map((r) => ({
        buildingId: r.building_id,
        count: Number(r.count),
      }));
  }

  /** 按占用方式统计（受大厦范围约束；空/非 part 计为整租） */
  async countByOccupancyMode(): Promise<{ all: number; whole: number; part: number }> {
    const where: Prisma.ContractWhereInput = {};
    await this.access.constrain(where, 'viaRoom');
    const rows = await this.prisma.contract.groupBy({
      by: ['occupancyMode'],
      where,
      _count: { _all: true },
    });
    const counts = { all: 0, whole: 0, part: 0 };
    for (const row of rows) {
      const n = row._count._all;
      counts.all += n;
      const mode = String(row.occupancyMode || '')
        .trim()
        .toLowerCase();
      if (mode === 'part') counts.part += n;
      else counts.whole += n;
    }
    return counts;
  }

  /** HK 今日 YYYY-MM-DD */
  private hkTodayYmd(now = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Hong_Kong',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }

  private addLeadYmd(ymd: string, amount: number, unit: 'day' | 'month'): string {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (unit === 'month') {
      dt.setUTCMonth(dt.getUTCMonth() + amount);
    } else {
      dt.setUTCDate(dt.getUTCDate() + amount);
    }
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  /** 即将到期条件 → Prisma where 片段（endDate + status） */
  private expiringSoonWhereParts(cfg: ContractExpiringSoonConfig): {
    endDateFrom: string;
    endDateTo: string;
    statusFilter?: Prisma.StringFilter;
  } {
    const from = this.hkTodayYmd();
    const to = this.addLeadYmd(from, cfg.amount, cfg.unit);
    let statusFilter: Prisma.StringFilter | undefined;
    const statuses = (cfg.statuses || []).map((s) => s.trim()).filter(Boolean);
    if (cfg.statusMode === 'include' && statuses.length) {
      statusFilter = { in: statuses };
    } else if (cfg.statusMode === 'exclude' && statuses.length) {
      statusFilter = { notIn: statuses };
    }
    return { endDateFrom: from, endDateTo: to, statusFilter };
  }

  /** 页头「即将到期」数量（受大厦范围；条件读系统设置） */
  async countExpiringSoon(): Promise<{ count: number; config: ContractExpiringSoonConfig }> {
    const config = await this.systemSettings.getContractExpiringSoon();
    const parts = this.expiringSoonWhereParts(config);
    const where: Prisma.ContractWhereInput = {};
    const endDate = dateRangeFilter(parts.endDateFrom, parts.endDateTo);
    if (endDate) where.endDate = endDate;
    if (parts.statusFilter) where.status = parts.statusFilter;
    await this.access.constrain(where, 'viaRoom');
    const count = await this.prisma.contract.count({ where });
    return { count, config };
  }

  async findAll(params: {
    keyword?: string;
    status?: string;
    statuses?: string[];
    customerId?: string;
    roomId?: string;
    requirementId?: string;
    buildingIds?: string[];
    roomCodes?: string[];
    customerNames?: string[];
    salesManagers?: string[];
    leaseTypes?: string[];
    /** 租赁方式筛选：whole | part | part:A */
    occupancyKeys?: string[];
    paymentCycles?: string[];
    paymentMethods?: string[];
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    startDateFrom?: string;
    startDateTo?: string;
    endDateFrom?: string;
    endDateTo?: string;
    createdAtFrom?: string;
    createdAtTo?: string;
    /** 页头「即将到期」：按系统设置套用到期窗与状态 */
    expiringSoon?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<ReturnType<typeof toContractDto>>> {
    const page = parsePage(params.page);
    const pageSize = parsePageSize(params.pageSize);
    let listParams = { ...params };
    if (params.expiringSoon) {
      const cfg = await this.systemSettings.getContractExpiringSoon();
      const parts = this.expiringSoonWhereParts(cfg);
      const maxYmd = (a?: string, b?: string) => {
        if (!a) return b;
        if (!b) return a;
        return a >= b ? a : b;
      };
      const minYmd = (a?: string, b?: string) => {
        if (!a) return b;
        if (!b) return a;
        return a <= b ? a : b;
      };
      listParams = {
        ...listParams,
        endDateFrom: maxYmd(listParams.endDateFrom, parts.endDateFrom),
        endDateTo: minYmd(listParams.endDateTo, parts.endDateTo),
        // 页头即将到期状态条件优先于表头状态多选（避免互相打架）
        status: undefined,
        statuses: undefined,
      };
      const where = this.buildListWhere(listParams);
      if (parts.statusFilter) {
        const and = Array.isArray(where.AND) ? [...where.AND] : where.AND ? [where.AND] : [];
        and.push({ status: parts.statusFilter });
        where.AND = and;
      }
      await this.access.constrain(where, 'viaRoom');
      const { skip, take } = paginateArgs(page, pageSize);
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.contract.count({ where }),
        this.prisma.contract.findMany({
          where,
          include: contractInclude,
          orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
          ...(skip != null ? { skip, take } : {}),
        }),
      ]);
      return {
        items: rows.map((r) => toContractDto(r)),
        total,
        page,
        pageSize: pageSize ?? total,
      };
    }
    const where = this.buildListWhere(listParams);
    await this.access.constrain(where, 'viaRoom');
    const { skip, take } = paginateArgs(page, pageSize);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contract.count({ where }),
      this.prisma.contract.findMany({
        where,
        include: contractInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...(skip != null ? { skip, take } : {}),
      }),
    ]);

    return {
      items: rows.map(toContractDto),
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    };
  }

  private buildListWhere(params: {
    keyword?: string;
    status?: string;
    statuses?: string[];
    customerId?: string;
    roomId?: string;
    requirementId?: string;
    buildingIds?: string[];
    roomCodes?: string[];
    customerNames?: string[];
    salesManagers?: string[];
    leaseTypes?: string[];
    occupancyKeys?: string[];
    paymentCycles?: string[];
    paymentMethods?: string[];
    startDateFrom?: string;
    startDateTo?: string;
    endDateFrom?: string;
    endDateTo?: string;
    createdAtFrom?: string;
    createdAtTo?: string;
  }): Prisma.ContractWhereInput {
    const where: Prisma.ContractWhereInput = {};
    const and: Prisma.ContractWhereInput[] = [];

    if (params.customerId?.trim()) where.customerId = params.customerId.trim();
    if (params.roomId?.trim()) where.roomId = params.roomId.trim();
    if (params.requirementId?.trim()) where.requirementId = params.requirementId.trim();
    const buildingIds = (params.buildingIds || []).map((v) => s(v)).filter(Boolean);
    if (buildingIds.length === 1) {
      and.push({ room: { buildingId: buildingIds[0] } });
    } else if (buildingIds.length > 1) {
      and.push({ room: { buildingId: { in: buildingIds } } });
    }

    const statuses = [
      ...new Set(
        [...(params.statuses || []), params.status?.trim() || '']
          .map((v) => s(v))
          .filter(Boolean),
      ),
    ];
    if (statuses.length === 1) where.status = statuses[0];
    else if (statuses.length > 1) where.status = { in: statuses };

    const roomCodes = (params.roomCodes || []).map((v) => s(v)).filter(Boolean);
    if (roomCodes.length) {
      and.push({ room: { roomCode: { in: roomCodes } } });
    }

    const customerNames = (params.customerNames || []).map((v) => s(v)).filter(Boolean);
    if (customerNames.length) {
      and.push({ customer: { name: { in: customerNames } } });
    }

    const salesManagers = (params.salesManagers || []).map((v) => s(v)).filter(Boolean);
    if (salesManagers.length) {
      and.push({ salesManagerUser: userWhereActorLabels(salesManagers) });
    }

    const leaseTypes = (params.leaseTypes || []).map((v) => s(v)).filter(Boolean);
    if (leaseTypes.length === 1) where.leaseType = leaseTypes[0];
    else if (leaseTypes.length > 1) where.leaseType = { in: leaseTypes };

    const occupancyKeys = [...new Set((params.occupancyKeys || []).map((v) => s(v)).filter(Boolean))];
    if (occupancyKeys.length) {
      const occOr: Prisma.ContractWhereInput[] = [];
      for (const key of occupancyKeys) {
        const lower = key.toLowerCase();
        if (lower === 'whole') {
          occOr.push({
            OR: [{ occupancyMode: 'whole' }, { occupancyMode: '' }],
          });
        } else if (lower === 'part') {
          occOr.push({ occupancyMode: 'part' });
        } else if (lower.startsWith('part:')) {
          const label = key.slice(5).trim().toUpperCase();
          if (label) occOr.push({ occupancyMode: 'part', partLabel: label });
        }
      }
      if (occOr.length === 1) and.push(occOr[0]!);
      else if (occOr.length > 1) and.push({ OR: occOr });
    }

    const paymentCycles = (params.paymentCycles || []).map((v) => s(v)).filter(Boolean);
    if (paymentCycles.length === 1) where.paymentCycle = paymentCycles[0];
    else if (paymentCycles.length > 1) where.paymentCycle = { in: paymentCycles };

    const paymentMethods = (params.paymentMethods || []).map((v) => s(v)).filter(Boolean);
    if (paymentMethods.length === 1) where.paymentMethod = paymentMethods[0];
    else if (paymentMethods.length > 1) where.paymentMethod = { in: paymentMethods };

    const keyword = s(params.keyword);
    if (keyword) {
      and.push({
        OR: [
          { contractCode: { contains: keyword, mode: 'insensitive' } },
          { leaseType: { contains: keyword, mode: 'insensitive' } },
          { paymentCycle: { contains: keyword, mode: 'insensitive' } },
          { roomNameText: { contains: keyword, mode: 'insensitive' } },
          { remark: { contains: keyword, mode: 'insensitive' } },
          { subleaseMark: { contains: keyword, mode: 'insensitive' } },
          { customer: { name: { contains: keyword, mode: 'insensitive' } } },
          { customer: { customerCode: { contains: keyword, mode: 'insensitive' } } },
          { room: { roomCode: { contains: keyword, mode: 'insensitive' } } },
          { room: { name: { contains: keyword, mode: 'insensitive' } } },
          { salesManagerUser: { account: { contains: keyword, mode: 'insensitive' } } },
          { salesManagerUser: { displayName: { contains: keyword, mode: 'insensitive' } } },
        ],
      });
    }

    const startDate = dateRangeFilter(params.startDateFrom, params.startDateTo);
    if (startDate) where.startDate = startDate;
    const endDate = dateRangeFilter(params.endDateFrom, params.endDateTo);
    if (endDate) where.endDate = endDate;
    const createdAt = dateRangeFilter(params.createdAtFrom, params.createdAtTo, true);
    if (createdAt) where.createdAt = createdAt;

    if (and.length) where.AND = and;
    return where;
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.ContractOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'desc';
    const key = s(sortBy);
    if (!key) return [{ createdAt: 'desc' }, { contractCode: 'desc' }];
    if (key === 'contractCode') return [{ contractCode: dir }];
    if (key === 'roomCode') return [{ room: { roomCode: dir } }];
    if (key === 'customerName') return [{ customer: { name: dir } }];
    if (key === 'salesManager') {
      return [
        { salesManagerUser: { displayName: dir } },
        { salesManagerUser: { account: dir } },
      ];
    }
    if (key === 'startDate') return [{ startDate: dir }, { createdAt: 'desc' }];
    if (key === 'endDate') return [{ endDate: dir }, { createdAt: 'desc' }];
    if (key === 'status') return [{ status: dir }, { startDate: 'desc' }];
    if (key === 'leaseType' || key === 'occupancyMode') {
      return [{ occupancyMode: dir }, { partLabel: dir }];
    }
    if (key === 'monthlyRent') return [{ monthlyRent: dir }];
    if (key === 'paymentCycle') return [{ paymentCycle: dir }];
    if (key === 'paymentMethod') return [{ paymentMethod: dir }];
    if (key === 'invoiceCount') return [{ invoices: { _count: dir } }];
    if (key === 'receivableCount') return [{ receivables: { _count: dir } }];
    if (key === 'receiptCount') return [{ receipts: { _count: dir } }];
    if (key === 'periodCount') return [{ periods: { _count: dir } }];
    if (key === 'terminationCount') return [{ terminations: { _count: dir } }];
    if (key === 'otherFeeCount') return [{ otherFees: { _count: dir } }];
    if (key === 'depositDeductionCount') return [{ otherFees: { _count: dir } }];
    if (key === 'depositRefundCount') return [{ depositRefunds: { _count: dir } }];
    if (key === 'createdAt') return [{ createdAt: dir }];
    return [{ startDate: 'desc' }, { createdAt: 'desc' }];
  }

  async findOne(id: string) {
    const row = await this.prisma.contract.findUnique({
      where: { id },
      include: contractInclude,
    });
    if (!row) throw new NotFoundException(`Contract ${id} not found`);
    await this.access.assertContractId(row.id);
    return toContractDto(row);
  }

  /** 香港日历下的 YYYYMMDD / HHmmss（合约编号用） */
  private hkDateTimeParts(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Hong_Kong',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value || '';
    return {
      datePart: `${get('year')}${get('month')}${get('day')}`,
      timePart: `${get('hour')}${get('minute')}${get('second')}`,
    };
  }

  /** 合约编号：房间编号-当日日期（如 TL507-20261023）；同日冲突时再拼时分秒 */
  private async nextContractCode(roomCode: string) {
    const base = s(roomCode);
    if (!base) throw new BadRequestException('roomCode is required for auto contract code');
    const { datePart, timePart } = this.hkDateTimeParts();
    const taken = async (code: string) =>
      !!(await this.prisma.contract.findFirst({
        where: { contractCode: code },
        select: { id: true },
      }));

    let code = `${base}-${datePart}`;
    if (!(await taken(code))) return code;

    code = `${base}-${datePart}${timePart}`;
    let guard = 0;
    while ((await taken(code)) && guard < 100) {
      guard += 1;
      code = `${base}-${datePart}${timePart}-${guard}`;
    }
    return code;
  }

  private async assertRoom(roomId: string) {
    const r = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        roomCode: true,
        monthlyRent: true,
        subleaseMark: true,
        leaseCapability: true,
        splitLabels: true,
      },
    });
    if (!r) throw new BadRequestException('Invalid roomId');
    return r;
  }

  /** 解析并校验占用方式；冲突时抛错 */
  private async resolveOccupancy(
    room: {
      id: string;
      roomCode: string;
      leaseCapability: RoomLeaseCapability;
      splitLabels: string[];
      subleaseMark: string | null;
    },
    dto: { occupancyMode?: string | null; partLabel?: string | null; subleaseMark?: string | null },
    opts?: { excludeContractId?: string; status?: string },
  ) {
    let mode = normalizeOccupancyMode(dto.occupancyMode);
    let partLabel = s(dto.partLabel).toUpperCase() || s(dto.subleaseMark).toUpperCase();

    // 只能整租 / 只能分租（独立后缀房如 6SPi09A）：均按整间占用该房间，无份位列表
    if (
      room.leaseCapability === RoomLeaseCapability.whole_only ||
      room.leaseCapability === RoomLeaseCapability.part_only
    ) {
      mode = 'whole';
      partLabel = '';
    } else if (!s(dto.occupancyMode) && partLabel) {
      mode = 'part';
    }

    if (mode === 'part' && room.leaseCapability !== RoomLeaseCapability.flexible) {
      throw new BadRequestException('仅「可整可分」房间可按份位分租；只能分租请使用带后缀的独立房间');
    }

    if (mode === 'part') {
      if (!partLabel) throw new BadRequestException('分租须指定份位标签（如 A/B/C）');
      const labels = normalizeSplitLabels(room.splitLabels);
      if (!labels.length) {
        throw new BadRequestException('该房间未配置分租份位，无法分租');
      }
      if (!labels.includes(partLabel)) {
        throw new BadRequestException(`份位「${partLabel}」不在该房间可分租列表：${labels.join('/')}`);
      }
    } else {
      partLabel = '';
    }

    const willOccupy =
      !opts?.status ||
      (OCCUPYING_CONTRACT_STATUSES as readonly string[]).includes(opts.status);
    if (!willOccupy) {
      return {
        occupancyMode: mode,
        partLabel,
        subleaseMark: mode === 'part' ? partLabel : '',
      };
    }

    const others = await this.prisma.contract.findMany({
      where: {
        roomId: room.id,
        status: { in: [...OCCUPYING_CONTRACT_STATUSES] },
        ...(opts?.excludeContractId ? { id: { not: opts.excludeContractId } } : {}),
      },
      select: {
        id: true,
        contractCode: true,
        status: true,
        occupancyMode: true,
        partLabel: true,
        customer: { select: { name: true } },
      },
    });
    const occupancy = buildRoomOccupancy(
      { leaseCapability: room.leaseCapability, splitLabels: room.splitLabels },
      others.map((c) => ({
        id: c.id,
        contractCode: c.contractCode,
        status: c.status,
        occupancyMode: c.occupancyMode,
        partLabel: c.partLabel,
        customerName: c.customer?.name,
      })),
    );

    if (mode === 'whole') {
      if (occupancy.wholeOccupied || occupancy.slots.some((x) => x.occupied)) {
        throw new BadRequestException('该房间已有占用中的合约，无法再整租');
      }
    } else {
      if (occupancy.wholeOccupied) {
        throw new BadRequestException('该房间整租占用中，无法再分租');
      }
      const slot = occupancy.slots.find((x) => x.label === partLabel);
      if (slot?.occupied) {
        throw new BadRequestException(`份位「${partLabel}」已被合约「${slot.contractCode}」占用`);
      }
    }

    return {
      occupancyMode: mode,
      partLabel,
      subleaseMark: mode === 'part' ? partLabel : '',
    };
  }

  private async assertCustomer(customerId: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!c) throw new BadRequestException('Invalid customerId');
  }

  private async assertUser(userId: string | null) {
    if (!userId) return;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new BadRequestException('Invalid salesManagerId');
  }

  private async assertRequirement(requirementId: string | null, customerId?: string) {
    if (!requirementId) return;
    const row = await this.prisma.customerRequirement.findUnique({
      where: { id: requirementId },
      select: { id: true, customerId: true },
    });
    if (!row) throw new BadRequestException('Invalid requirementId');
    if (customerId && row.customerId !== customerId) {
      throw new BadRequestException('requirementId 不属于所选客户');
    }
  }

  private normalizeStatus(status?: string) {
    const raw = s(status) || '簽約中';
    const v = STATUS_ALIASES[raw] || STATUS_ALIASES[raw.toLowerCase()] || raw;
    if (!ALLOWED_STATUSES.has(v)) {
      throw new BadRequestException(`status must be one of: ${[...ALLOWED_STATUSES].join(' / ')}`);
    }
    return v;
  }

  /** 现行/历史归并后的状态文案 */
  private canonicalStatus(status?: string | null) {
    const raw = s(status);
    return STATUS_ALIASES[raw] || STATUS_ALIASES[raw.toLowerCase()] || raw;
  }

  /** 仅「簽約中」可经 update 接口修改；superAdmin / 开单等专用路径不受此限 */
  private assertSigningEditable(existingStatus?: string | null) {
    if (this.canonicalStatus(existingStatus) !== '簽約中') {
      throw new BadRequestException('僅「簽約中」的合約可修改');
    }
  }

  private async normalizePeriodType(v?: string) {
    const raw = s(v);
    if (!raw) throw new BadRequestException('periods.dateType is required');
    const labels = await this.contractConfigs.activePeriodTypeLabels();
    if (!labels.includes(raw)) {
      throw new BadRequestException(
        labels.length
          ? `periods.dateType must be one of: ${labels.join(' / ')}`
          : 'No active period types configured',
      );
    }
    return raw;
  }

  private normalizePeriodUnit(v?: string) {
    const raw = s(v) || '月';
    const mapped = PERIOD_UNIT_ALIASES[raw] || PERIOD_UNIT_ALIASES[raw.toLowerCase()] || raw;
    if (!ALLOWED_PERIOD_UNITS.has(mapped)) {
      throw new BadRequestException(`periods.dateUnit must be one of: 月 / 日`);
    }
    return mapped;
  }

  private async parsePeriods(items?: ContractPeriodInputDto[]) {
    if (!items?.length) return [];
    const out = [];
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const startDate = parseDateOnly(item.startDate, `periods[${idx}].startDate`);
      const endDate = parseDateOnly(item.endDate, `periods[${idx}].endDate`);
      if (!startDate || !endDate) {
        throw new BadRequestException(`periods[${idx}] startDate/endDate are required`);
      }
      if (endDate.getTime() < startDate.getTime()) {
        throw new BadRequestException(`periods[${idx}] endDate must be >= startDate`);
      }
      out.push({
        dateType: await this.normalizePeriodType(item.dateType),
        dateUnit: this.normalizePeriodUnit(item.dateUnit),
        dateValue: Math.max(0, Math.floor(Number(item.dateValue ?? 0) || 0)),
        startDate,
        endDate,
        sortOrder: item.sortOrder != null ? Math.floor(Number(item.sortOrder)) : idx,
      });
    }
    this.assertPeriodsNoOverlap(out);
    return out;
  }

  /** 无用户显式传入起止时，用合约期首段开始 / 末段结束兜底 */
  private async summarizeDatesFromPeriods(
    periods: { sortOrder: number; startDate: Date; endDate: Date }[],
  ): Promise<{ startDate: Date | null; endDate: Date | null }> {
    if (!periods.length) return { startDate: null, endDate: null };
    const sorted = [...periods].sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      startDate: sorted[0].startDate,
      endDate: sorted[sorted.length - 1].endDate,
    };
  }

  /** 合约期日期不可重叠（含首尾同日） */
  private assertPeriodsNoOverlap(
    periods: { startDate: Date; endDate: Date; sortOrder: number }[],
  ): void {
    if (periods.length < 2) return;
    const sorted = [...periods].sort((a, b) => {
      const t = a.startDate.getTime() - b.startDate.getTime();
      if (t !== 0) return t;
      return a.sortOrder - b.sortOrder;
    });
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (
          a.startDate.getTime() <= b.endDate.getTime() &&
          b.startDate.getTime() <= a.endDate.getTime()
        ) {
          throw new BadRequestException(
            `合約期日期重疊（第 ${i + 1} 段與第 ${j + 1} 段），請調整後再儲存`,
          );
        }
      }
    }
  }

  /**
   * 用户填写的合约起止约束合约期：
   * 首段开始日 = 合约开始日；末段结束日 = 合约结束日。
   */
  private assertPeriodsMatchContractSpan(
    periods: { sortOrder: number; startDate: Date; endDate: Date }[],
    startDate: Date | null,
    endDate: Date | null,
  ): void {
    if (!periods.length || !startDate || !endDate) return;
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('合約結束日期不可早於開始日期');
    }
    const sorted = [...periods].sort((a, b) => a.sortOrder - b.sortOrder);
    if (sorted[0].startDate.getTime() !== startDate.getTime()) {
      throw new BadRequestException('第一段合約期的開始日期必須等於合約開始日期');
    }
    if (sorted[sorted.length - 1].endDate.getTime() !== endDate.getTime()) {
      throw new BadRequestException('最後一段合約期的結束日期必須等於合約結束日期');
    }
  }

  /** 合约期不能仅有免租期，须至少一段非免租期 */
  private async assertPeriodsNotOnlyRentFree(
    periods: { dateType: string }[],
  ): Promise<void> {
    if (!periods.length) return;
    const rentFree = await this.contractConfigs.rentFreePeriodLabels();
    if (periods.every((p) => rentFree.has(p.dateType))) {
      throw new BadRequestException(
        '合約期不能僅有免租期，請至少添加一段使用期或必須使用期',
      );
    }
  }

  private async replacePeriods(
    tx: Prisma.TransactionClient,
    contractId: string,
    periods: {
      dateType: string;
      dateUnit: string;
      dateValue: number;
      startDate: Date;
      endDate: Date;
      sortOrder: number;
    }[],
  ) {
    await tx.contractPeriod.deleteMany({ where: { contractId } });
    if (!periods.length) return;
    await tx.contractPeriod.createMany({
      data: periods.map((p) => ({
        contractId,
        dateType: p.dateType,
        dateUnit: p.dateUnit,
        dateValue: p.dateValue,
        startDate: p.startDate,
        endDate: p.endDate,
        sortOrder: p.sortOrder,
      })),
    });
  }

  private parseOtherFees(items?: ContractOtherFeeInputDto[]) {
    if (!items?.length) return [];
    return items.map((item, idx) => {
      const description = s(item.description);
      if (!description) {
        throw new BadRequestException(`otherFees[${idx}].description is required`);
      }
      if (item.quantity == null || Number.isNaN(Number(item.quantity))) {
        throw new BadRequestException(`otherFees[${idx}].quantity is required`);
      }
      if (item.unitAmount == null || Number.isNaN(Number(item.unitAmount))) {
        throw new BadRequestException(`otherFees[${idx}].unitAmount is required`);
      }
      const quantity = decimalField(item.quantity, `otherFees[${idx}].quantity`);
      const unitAmount = decimalField(item.unitAmount, `otherFees[${idx}].unitAmount`);
      const subtotal = feeSubtotal(quantity, unitAmount, item.subtotal);
      return {
        description,
        quantity,
        unitAmount,
        subtotal,
        remark: s(item.remark),
        sortOrder: item.sortOrder != null ? Math.floor(Number(item.sortOrder)) : idx,
      };
    });
  }

  /** 仅替换合约级借出物品（terminationId 为空）；退租关联费用保留 */
  private async replaceContractOtherFees(
    tx: Prisma.TransactionClient,
    contractId: string,
    fees: ReturnType<ContractsService['parseOtherFees']>,
    actorId: string | null,
  ) {
    await tx.contractOtherFee.deleteMany({ where: { contractId, terminationId: null } });
    if (!fees.length) return;
    await tx.contractOtherFee.createMany({
      data: fees.map((f) => ({
        contractId,
        description: f.description,
        quantity: f.quantity,
        unitAmount: f.unitAmount,
        subtotal: f.subtotal,
        remark: f.remark,
        sortOrder: f.sortOrder,
        createdById: actorId,
        updatedById: actorId,
      })),
    });
  }

  /** 按该房全部占用中合约重算房间状态与最新合约摘要 */
  private async syncRoomFromContract(
    tx: Prisma.TransactionClient,
    roomId: string,
    _contractCode: string,
    _status: string,
    actorId: string | null,
  ) {
    const room = await tx.room.findUnique({
      where: { id: roomId },
      select: { leaseCapability: true, splitLabels: true },
    });
    const occupying = await tx.contract.findMany({
      where: { roomId, status: { in: [...OCCUPYING_CONTRACT_STATUSES] } },
      select: {
        contractCode: true,
        status: true,
        occupancyMode: true,
        partLabel: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    const occupancy = buildRoomOccupancy(
      {
        leaseCapability: room?.leaseCapability || RoomLeaseCapability.flexible,
        splitLabels: room?.splitLabels || [],
      },
      occupying.map((c) => ({
        id: c.contractCode,
        contractCode: c.contractCode,
        status: c.status,
        occupancyMode: c.occupancyMode,
        partLabel: c.partLabel,
      })),
    );
    let latest = '';
    if (occupancy.wholeOccupied) {
      latest = occupancy.wholeContractCode || occupying[0]?.contractCode || '';
    } else if (occupancy.slots.some((x) => x.occupied)) {
      latest = occupancy.slots
        .filter((x) => x.occupied)
        .map((x) => `${x.label}:${x.contractCode || ''}`)
        .join(' / ');
    } else if (occupying[0]) {
      latest = occupying[0].contractCode;
    }
    await tx.room.update({
      where: { id: roomId },
      data: {
        latestContract: latest || null,
        status: aggregateRoomStatus(occupying),
        ...(actorId ? { updatedById: actorId } : {}),
      },
    });
  }

  async create(dto: CreateContractDto, actor = '') {
    const roomId = s(dto.roomId);
    const customerId = s(dto.customerId);
    if (!roomId) throw new BadRequestException('roomId is required');
    if (!customerId) throw new BadRequestException('customerId is required');

    const room = await this.assertRoom(roomId);
    await this.assertCustomer(customerId);

    const salesManagerId = nullId(dto.salesManagerId);
    await this.assertUser(salesManagerId);

    const requirementId = nullId(dto.requirementId);
    await this.assertRequirement(requirementId, customerId);

    const issueNow = Boolean(dto.issueNow);
    const attachment = s(dto.attachment);
    if (issueNow && !attachment) {
      throw new BadRequestException('直接開單請先上傳租客簽約文件');
    }
    // 普通保存固定「簽約中」；直接开单 →「租賃中」（忽略客户端随意改状态）
    const status = issueNow ? '租賃中' : '簽約中';
    const occupancy = await this.resolveOccupancy(room, dto, { status });
    const codeBase = contractCodeRoomBase({
      roomCode: room.roomCode,
      leaseCapability: room.leaseCapability,
      occupancyMode: occupancy.occupancyMode,
      partLabel: occupancy.partLabel,
    });
    const contractCode = s(dto.contractCode) || (await this.nextContractCode(codeBase));
    const actorId = actor || null;
    const roomNameText = s(dto.roomNameText) || room.name;
    const monthlyRent =
      dto.monthlyRent !== undefined ? numOrNull(dto.monthlyRent) : Number(room.monthlyRent);
    const periods = await this.parsePeriods(dto.periods);
    await this.assertPeriodsNotOnlyRentFree(periods);
    const otherFees = this.parseOtherFees(dto.otherFees);
    const summarized = await this.summarizeDatesFromPeriods(periods);
    const startDate =
      dto.startDate !== undefined
        ? parseDateOnly(dto.startDate, 'startDate')
        : summarized.startDate;
    const endDate =
      dto.endDate !== undefined ? parseDateOnly(dto.endDate, 'endDate') : summarized.endDate;
    if (!startDate || !endDate) {
      throw new BadRequestException('請填寫合約開始日期與結束日期');
    }
    this.assertPeriodsMatchContractSpan(periods, startDate, endDate);
    const keyDeposits = await this.contractConfigs.calcKeyDeposits(
      dto.doorKeyQty,
      dto.mailboxKeyQty,
    );

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.contract.create({
          data: {
            contractCode,
            roomId,
            customerId,
            salesManagerId,
            requirementId,
            startDate,
            endDate,
            actualEndDate: parseDateOnly(dto.actualEndDate, 'actualEndDate'),
            leaseType: s(dto.leaseType),
            occupancyMode: occupancy.occupancyMode,
            partLabel: occupancy.partLabel,
            status,
            roomDeposit: numOrNull(dto.roomDeposit),
            monthlyRent,
            bookingDeposit: numOrNull(dto.bookingDeposit),
            paymentDate: parseDateOnly(dto.paymentDate, 'paymentDate'),
            paymentCycle: s(dto.paymentCycle),
            paymentMethod: s(dto.paymentMethod),
            paymentVoucher: s(dto.paymentVoucher),
            electricityRate: numOrNull(dto.electricityRate),
            miscDeposit: numOrNull(dto.miscDeposit),
            doorKeyQty: keyDeposits.doorKeyQty,
            mailboxKeyQty: keyDeposits.mailboxKeyQty,
            doorKeyDeposit: keyDeposits.doorKeyDeposit,
            mailboxKeyDeposit: keyDeposits.mailboxKeyDeposit,
            roomNameText,
            subleaseMark: occupancy.subleaseMark,
            attachment,
            remark: s(dto.remark),
            createdById: actorId,
            updatedById: actorId,
          },
        });
        await this.replacePeriods(tx, created.id, periods);
        if (dto.otherFees !== undefined) {
          await this.replaceContractOtherFees(tx, created.id, otherFees, actorId);
        }
        await this.syncRoomFromContract(tx, roomId, contractCode, status, actorId);
        // 创建即幂等生成按金发票 + 首个缴费周期租金发票（及对应应收）；后续期须「租賃中」才由日任务开票
        await this.invoiceAuto.ensureInitialInvoicesOnIssue(created.id, actorId, tx);
        if (issueNow) {
          await this.receipts.ensureBookingDepositReceipt(
            {
              id: created.id,
              customerId,
              bookingDeposit: numOrNull(dto.bookingDeposit),
              paymentDate: parseDateOnly(dto.paymentDate, 'paymentDate'),
              paymentMethod: s(dto.paymentMethod),
              paymentVoucher: s(dto.paymentVoucher),
              bookingDepositReceiptId: null,
            },
            actorId,
            tx,
          );
        }
        return tx.contract.findUniqueOrThrow({
          where: { id: created.id },
          include: contractInclude,
        });
      });
      return toContractDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Contract code「${contractCode}」already exists`);
      }
      throw e;
    }
  }

  /**
   * 开单：上传租客签约文件，仅「簽約中」（含历史归并态）可操作，状态改为「租賃中」。
   */
  async openOrder(id: string, dto: OpenContractOrderDto, actor = '') {
    const existing = await this.prisma.contract.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Contract ${id} not found`);
    await this.access.assertContractId(existing.id);

    if (this.canonicalStatus(existing.status) !== '簽約中') {
      throw new BadRequestException('僅「簽約中」的合約可開單');
    }

    const attachment = s(dto.attachment);
    if (!attachment) {
      throw new BadRequestException('請上傳租客簽約文件');
    }

    const status = '租賃中';
    const actorId = actor || null;
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id },
        data: {
          attachment,
          status,
          ...(actorId ? { updatedById: actorId } : {}),
        },
      });
      await this.syncRoomFromContract(
        tx,
        existing.roomId,
        existing.contractCode,
        status,
        actorId,
      );
      await this.receipts.ensureBookingDepositReceipt(
        {
          id: existing.id,
          customerId: existing.customerId,
          bookingDeposit: existing.bookingDeposit,
          paymentDate: existing.paymentDate,
          paymentMethod: existing.paymentMethod,
          paymentVoucher: existing.paymentVoucher,
          bookingDepositReceiptId: existing.bookingDepositReceiptId,
        },
        actorId,
        tx,
      );
      await this.invoiceAuto.ensureInitialInvoicesOnIssue(existing.id, actorId, tx);
      return tx.contract.findUniqueOrThrow({
        where: { id },
        include: contractInclude,
      });
    });
    return toContractDto(row);
  }

  async update(
    id: string,
    dto: UpdateContractDto,
    actor = '',
    opts?: { role?: string | null },
  ) {
    const existing = await this.prisma.contract.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Contract ${id} not found`);
    // superAdmin 行内/任意修补不受签约流程限制
    const bypassFlow = isSuperAdminRole(opts?.role);
    if (!bypassFlow) {
      this.assertSigningEditable(existing.status);
    }

    let roomId = existing.roomId;
    let room = await this.assertRoom(roomId);
    if (dto.roomId !== undefined) {
      roomId = s(dto.roomId);
      if (!roomId) throw new BadRequestException('roomId is required');
      room = await this.assertRoom(roomId);
    }

    let customerId = existing.customerId;
    if (dto.customerId !== undefined) {
      customerId = s(dto.customerId);
      if (!customerId) throw new BadRequestException('customerId is required');
      await this.assertCustomer(customerId);
    }

    const salesManagerId =
      dto.salesManagerId !== undefined ? nullId(dto.salesManagerId) : undefined;
    if (salesManagerId !== undefined) await this.assertUser(salesManagerId);

    const requirementId =
      dto.requirementId !== undefined ? nullId(dto.requirementId) : undefined;
    if (requirementId !== undefined) {
      await this.assertRequirement(requirementId, customerId);
    }

    const issueNow = Boolean(dto.issueNow);
    const attachmentResolved =
      dto.attachment !== undefined ? s(dto.attachment) : s(existing.attachment);
    if (issueNow && !attachmentResolved) {
      throw new BadRequestException('直接開單請先上傳租客簽約文件');
    }

    let status: string;
    if (issueNow) {
      status = '租賃中';
    } else if (dto.status !== undefined) {
      status = this.normalizeStatus(dto.status);
      // 普通用户须走「直接开单」；superAdmin 可直接改状态（含租賃中）
      if (!bypassFlow && status === '租賃中') {
        throw new BadRequestException('請使用「直接開單」將合約轉為租賃中');
      }
    } else {
      status = existing.status;
    }

    const touchOccupancy =
      dto.occupancyMode !== undefined ||
      dto.partLabel !== undefined ||
      dto.subleaseMark !== undefined ||
      dto.roomId !== undefined ||
      dto.status !== undefined ||
      issueNow;
    const occupancy = touchOccupancy
      ? await this.resolveOccupancy(
          room,
          {
            occupancyMode: dto.occupancyMode ?? existing.occupancyMode,
            partLabel: dto.partLabel ?? existing.partLabel,
            subleaseMark: dto.subleaseMark ?? existing.subleaseMark,
          },
          { excludeContractId: id, status },
        )
      : null;
    const contractCode =
      dto.contractCode !== undefined ? s(dto.contractCode) : existing.contractCode;
    const actorId = actor || null;
    const replacePeriods = dto.periods !== undefined;
    const periods = replacePeriods ? await this.parsePeriods(dto.periods) : null;
    if (periods) await this.assertPeriodsNotOnlyRentFree(periods);
    const replaceOtherFees = dto.otherFees !== undefined;
    const otherFees = replaceOtherFees ? this.parseOtherFees(dto.otherFees) : null;
    const summarized = periods ? await this.summarizeDatesFromPeriods(periods) : null;
    const nextStartDate =
      dto.startDate !== undefined
        ? parseDateOnly(dto.startDate, 'startDate')
        : summarized
          ? summarized.startDate
          : existing.startDate;
    const nextEndDate =
      dto.endDate !== undefined
        ? parseDateOnly(dto.endDate, 'endDate')
        : summarized
          ? summarized.endDate
          : existing.endDate;
    if (periods) {
      if (!nextStartDate || !nextEndDate) {
        throw new BadRequestException('請填寫合約開始日期與結束日期');
      }
      this.assertPeriodsMatchContractSpan(periods, nextStartDate, nextEndDate);
    }
    const recalcKeys =
      dto.doorKeyQty !== undefined || dto.mailboxKeyQty !== undefined
        ? await this.contractConfigs.calcKeyDeposits(
            dto.doorKeyQty !== undefined ? dto.doorKeyQty : existing.doorKeyQty,
            dto.mailboxKeyQty !== undefined ? dto.mailboxKeyQty : existing.mailboxKeyQty,
          )
        : null;

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.contract.update({
          where: { id },
          data: {
            contractCode: dto.contractCode !== undefined ? contractCode : undefined,
            roomId: dto.roomId !== undefined ? roomId : undefined,
            customerId: dto.customerId !== undefined ? customerId : undefined,
            salesManagerId,
            requirementId,
            startDate:
              dto.startDate !== undefined || summarized
                ? nextStartDate
                : undefined,
            endDate:
              dto.endDate !== undefined || summarized
                ? nextEndDate
                : undefined,
            actualEndDate:
              dto.actualEndDate !== undefined
                ? parseDateOnly(dto.actualEndDate, 'actualEndDate')
                : undefined,
            leaseType: dto.leaseType !== undefined ? s(dto.leaseType) : undefined,
            ...(occupancy
              ? {
                  occupancyMode: occupancy.occupancyMode,
                  partLabel: occupancy.partLabel,
                  subleaseMark: occupancy.subleaseMark,
                }
              : {}),
            status: issueNow || dto.status !== undefined ? status : undefined,
            roomDeposit:
              dto.roomDeposit !== undefined ? numOrNull(dto.roomDeposit) : undefined,
            monthlyRent:
              dto.monthlyRent !== undefined ? numOrNull(dto.monthlyRent) : undefined,
            bookingDeposit:
              dto.bookingDeposit !== undefined ? numOrNull(dto.bookingDeposit) : undefined,
            paymentDate:
              dto.paymentDate !== undefined
                ? parseDateOnly(dto.paymentDate, 'paymentDate')
                : undefined,
            paymentCycle: dto.paymentCycle !== undefined ? s(dto.paymentCycle) : undefined,
            paymentMethod: dto.paymentMethod !== undefined ? s(dto.paymentMethod) : undefined,
            paymentVoucher:
              dto.paymentVoucher !== undefined ? s(dto.paymentVoucher) : undefined,
            electricityRate:
              dto.electricityRate !== undefined ? numOrNull(dto.electricityRate) : undefined,
            miscDeposit:
              dto.miscDeposit !== undefined ? numOrNull(dto.miscDeposit) : undefined,
            ...(recalcKeys
              ? {
                  doorKeyQty: recalcKeys.doorKeyQty,
                  mailboxKeyQty: recalcKeys.mailboxKeyQty,
                  doorKeyDeposit: recalcKeys.doorKeyDeposit,
                  mailboxKeyDeposit: recalcKeys.mailboxKeyDeposit,
                }
              : {}),
            roomNameText: dto.roomNameText !== undefined ? s(dto.roomNameText) : undefined,
            subleaseMark: dto.subleaseMark !== undefined ? s(dto.subleaseMark) : undefined,
            attachment:
              dto.attachment !== undefined || issueNow ? attachmentResolved : undefined,
            remark: dto.remark !== undefined ? s(dto.remark) : undefined,
            ...(actorId ? { updatedById: actorId } : {}),
          },
        });
        if (periods) await this.replacePeriods(tx, id, periods);
        if (otherFees) await this.replaceContractOtherFees(tx, id, otherFees, actorId);
        await this.syncRoomFromContract(tx, roomId, contractCode, status, actorId);
        const after = await tx.contract.findUniqueOrThrow({ where: { id } });
        // 签约中保存亦确保按金+首期发票存在（幂等；历史数据补齐）
        await this.invoiceAuto.ensureInitialInvoicesOnIssue(after.id, actorId, tx);
        if (issueNow) {
          await this.receipts.ensureBookingDepositReceipt(
            {
              id: after.id,
              customerId: after.customerId,
              bookingDeposit: after.bookingDeposit,
              paymentDate: after.paymentDate,
              paymentMethod: after.paymentMethod,
              paymentVoucher: after.paymentVoucher,
              bookingDepositReceiptId: after.bookingDepositReceiptId,
            },
            actorId,
            tx,
          );
        }
        return tx.contract.findUniqueOrThrow({
          where: { id },
          include: contractInclude,
        });
      });
      return toContractDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Contract code「${contractCode}」already exists`);
      }
      throw e;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.contract.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Contract ${id} not found`);
    await this.prisma.contract.delete({ where: { id } });
    return { success: true };
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }

  /** 批量导入：按房间编号 + 客户编号（或客户名称）关联；合约编号重复则跳过 */
  async importBatch(dto: ImportContractsDto, actor = '') {
    const items = dto.items || [];
    let created = 0;
    let skipped = 0;
    let unlinked = 0;
    let failed = 0;
    const issues: ImportIssue[] = [];

    const roomCodes = [...new Set(items.map((it) => s(it.roomCode)).filter(Boolean))];
    const customerCodes = [...new Set(items.map((it) => s(it.customerCode)).filter(Boolean))];
    const customerNames = [
      ...new Set(
        items
          .filter((it) => !s(it.customerCode) && s(it.customerName))
          .map((it) => s(it.customerName)),
      ),
    ];
    const reqCodes = [...new Set(items.map((it) => s(it.requirementCode)).filter(Boolean))];
    const contractCodes = [...new Set(items.map((it) => s(it.contractCode)).filter(Boolean))];

    const [rooms, customersByCode, customersByName, users, requirements, existingContracts] =
      await Promise.all([
        roomCodes.length
          ? this.prisma.room.findMany({
              where: { roomCode: { in: roomCodes } },
              select: {
                id: true,
                roomCode: true,
                name: true,
                subleaseMark: true,
                monthlyRent: true,
              },
            })
          : Promise.resolve([]),
        customerCodes.length
          ? this.prisma.customer.findMany({
              where: { customerCode: { in: customerCodes } },
              select: { id: true, customerCode: true, name: true },
            })
          : Promise.resolve([]),
        customerNames.length
          ? this.prisma.customer.findMany({
              where: {
                OR: customerNames.map((name) => ({
                  name: { equals: name, mode: 'insensitive' as const },
                })),
              },
              select: { id: true, customerCode: true, name: true },
            })
          : Promise.resolve([]),
        this.prisma.user.findMany({
          select: { id: true, account: true, displayName: true },
        }),
        reqCodes.length
          ? this.prisma.customerRequirement.findMany({
              where: { requirementCode: { in: reqCodes } },
              select: { id: true, requirementCode: true, customerId: true },
            })
          : Promise.resolve([]),
        contractCodes.length
          ? this.prisma.contract.findMany({
              where: { contractCode: { in: contractCodes } },
              select: { contractCode: true },
            })
          : Promise.resolve([]),
      ]);

    const roomByCode = new Map(rooms.map((r) => [r.roomCode.toLowerCase(), r]));
    const customerByCode = new Map(
      customersByCode.map((c) => [c.customerCode.toLowerCase(), c]),
    );
    /** 名称不唯一时记为 null，导入时记 unlinked */
    const customerByName = new Map<string, { id: string; customerCode: string; name: string } | null>();
    for (const c of customersByName) {
      const key = c.name.trim().toLowerCase();
      if (!key) continue;
      if (customerByName.has(key)) {
        customerByName.set(key, null);
      } else {
        customerByName.set(key, c);
      }
    }
    const reqByCode = new Map(requirements.map((r) => [r.requirementCode.toLowerCase(), r]));
    const userByLabel = new Map<string, string>();
    for (const u of users) {
      const account = u.account.trim().toLowerCase();
      const name = u.displayName.trim().toLowerCase();
      if (account) userByLabel.set(account, u.id);
      if (name) userByLabel.set(name, u.id);
    }
    const seenCodes = new Set(existingContracts.map((c) => c.contractCode.toLowerCase()));

    for (const item of items) {
      const roomCode = s(item.roomCode);
      const customerCode = s(item.customerCode);
      const customerName = s(item.customerName);
      const contractCode = s(item.contractCode);
      const keys = {
        合約編號: contractCode,
        房間編號: roomCode,
        客戶編號: customerCode,
        客戶名稱: customerName,
      };

      if (!roomCode || (!customerCode && !customerName)) {
        skipped += 1;
        pushImportIssue(issues, 'skipped', '缺少房間編號，或缺少客戶編號/客戶名稱', keys);
        continue;
      }

      const room = roomByCode.get(roomCode.toLowerCase());
      let customer =
        (customerCode ? customerByCode.get(customerCode.toLowerCase()) : undefined) ||
        undefined;
      if (!customer && customerName) {
        const byName = customerByName.get(customerName.toLowerCase());
        if (byName === null) {
          unlinked += 1;
          pushImportIssue(issues, 'unlinked', `客戶名稱「${customerName}」不唯一，無法匹配`, keys);
          continue;
        }
        customer = byName;
      }
      if (!room || !customer) {
        unlinked += 1;
        const parts: string[] = [];
        if (!room) parts.push(`房間「${roomCode}」未找到`);
        if (!customer) {
          parts.push(
            customerCode
              ? `客戶編號「${customerCode}」未找到`
              : `客戶名稱「${customerName}」未找到`,
          );
        }
        pushImportIssue(issues, 'unlinked', parts.join('；'), keys);
        continue;
      }

      if (contractCode && seenCodes.has(contractCode.toLowerCase())) {
        skipped += 1;
        pushImportIssue(issues, 'skipped', `合約編號「${contractCode}」已存在`, keys);
        continue;
      }

      const salesLabel = s(item.salesManager).toLowerCase();
      const salesManagerId = salesLabel ? userByLabel.get(salesLabel) || null : null;

      const requirementCode = s(item.requirementCode);
      let requirementId: string | null = null;
      if (requirementCode) {
        const req = reqByCode.get(requirementCode.toLowerCase());
        if (!req || req.customerId !== customer.id) {
          failed += 1;
          pushImportIssue(
            issues,
            'failed',
            `需求編號「${requirementCode}」無效或不屬於該客戶`,
            { ...keys, 需求編號: requirementCode },
          );
          continue;
        }
        requirementId = req.id;
      }

      try {
        await this.create(
          {
            contractCode: contractCode || undefined,
            roomId: room.id,
            customerId: customer.id,
            salesManagerId,
            requirementId,
            startDate: item.startDate ?? null,
            endDate: item.endDate ?? null,
            actualEndDate: item.actualEndDate ?? null,
            leaseType: item.leaseType,
            status: item.status,
            monthlyRent: item.monthlyRent,
            roomDeposit: item.roomDeposit,
            bookingDeposit: item.bookingDeposit,
            paymentCycle: item.paymentCycle,
            paymentMethod: item.paymentMethod,
            paymentDate: item.paymentDate ?? null,
            electricityRate: item.electricityRate,
            miscDeposit: item.miscDeposit,
            doorKeyQty: item.doorKeyQty,
            mailboxKeyQty: item.mailboxKeyQty,
            roomNameText: item.roomNameText,
            subleaseMark: item.subleaseMark,
            attachment: item.attachment,
            remark: item.remark,
          },
          actor,
        );
        if (contractCode) seenCodes.add(contractCode.toLowerCase());
        created += 1;
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : '建立合約失敗';
        pushImportIssue(issues, 'failed', msg, keys);
      }
    }

    return { created, updated: 0, skipped, failed, unlinked, issues };
  }
}
