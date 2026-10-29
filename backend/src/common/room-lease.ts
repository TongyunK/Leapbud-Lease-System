import { RoomLeaseCapability, RoomStatus } from '@prisma/client';

/** 占用房间份位的合约状态（非草稿/已结束） */
export const OCCUPYING_CONTRACT_STATUSES = [
  '簽約中',
  '已簽約',
  '交吉中',
  '租賃中',
  '已續約',
  '退租中',
] as const;

export type OccupancyMode = 'whole' | 'part';

export type OccupancySlotDto = {
  label: string;
  occupied: boolean;
  contractId?: string;
  contractCode?: string;
  customerName?: string;
  status?: string;
};

export type ShortTermOccupancyHit = {
  invoiceId: string;
  invoiceCode: string;
  shortTermRentalCode?: string;
  customerName?: string;
  rentalStartDate: string;
  rentalEndDate: string;
};

export type RoomOccupancyDto = {
  /** idle=闲置；whole=整租中；partial=分租中；full=满租；short=短租中 */
  summary: 'idle' | 'whole' | 'partial' | 'full' | 'short';
  wholeOccupied: boolean;
  wholeContractId?: string;
  wholeContractCode?: string;
  wholeCustomerName?: string;
  /** 整租合约业务状态（用于租用情况四态） */
  wholeStatus?: string;
  /** 短租占用（无合约占用时） */
  shortInvoiceId?: string;
  shortInvoiceCode?: string;
  shortTermRentalCode?: string;
  shortCustomerName?: string;
  shortRentalStartDate?: string;
  shortRentalEndDate?: string;
  slots: OccupancySlotDto[];
};

/** 短租发票是否视为有效占用（未取消且有租期） */
export function isActiveShortTermInvoiceStatus(status?: string | null): boolean {
  const v = s(status);
  return !!v && v !== '已取消';
}

/** 两段闭区间日期是否重叠（YYYY-MM-DD 或 Date） */
export function dateRangesOverlap(
  aStart: string | Date | null | undefined,
  aEnd: string | Date | null | undefined,
  bStart: string | Date | null | undefined,
  bEnd: string | Date | null | undefined,
): boolean {
  const as = toYmd(aStart);
  const ae = toYmd(aEnd);
  const bs = toYmd(bStart);
  const be = toYmd(bEnd);
  if (!as || !ae || !bs || !be) return false;
  return as <= be && bs <= ae;
}

/** 查询日是否落在闭区间内 */
export function dateInRange(
  asOf: string | Date | null | undefined,
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
): boolean {
  const d = toYmd(asOf);
  const s0 = toYmd(start);
  const e0 = toYmd(end);
  if (!d || !s0 || !e0) return false;
  return s0 <= d && d <= e0;
}

function toYmd(v: string | Date | null | undefined): string {
  if (!v) return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const day = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const raw = s(String(v));
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return '';
}

/** 在合约占用结果上叠加当日有效短租（仅闲置时显示短租中） */
export function applyShortTermOccupancy(
  base: RoomOccupancyDto,
  hit?: ShortTermOccupancyHit | null,
): RoomOccupancyDto {
  if (!hit || base.summary !== 'idle') return base;
  return {
    ...base,
    summary: 'short',
    wholeOccupied: true,
    shortInvoiceId: hit.invoiceId,
    shortInvoiceCode: hit.invoiceCode,
    shortTermRentalCode: hit.shortTermRentalCode || hit.invoiceCode,
    shortCustomerName: hit.customerName,
    shortRentalStartDate: hit.rentalStartDate,
    shortRentalEndDate: hit.rentalEndDate,
    slots: base.slots.map((x) => ({ ...x, occupied: true })),
  };
}

/** 从房间编号末尾识别固定份位字母 */
export function detectFixedPartLabel(roomCode: string): string | null {
  const m = s(roomCode).match(/([A-Za-z])$/);
  return m ? m[1]!.toUpperCase() : null;
}

export function normalizeSplitLabels(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const label = s(String(item ?? '')).toUpperCase();
    if (!label || seen.has(label)) continue;
    if (!/^[A-Z0-9]{1,4}$/.test(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

export function defaultSplitLabels(count = 2): string[] {
  const n = Math.min(26, Math.max(2, Math.floor(Number(count) || 2)));
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

export function normalizeLeaseCapability(raw?: string | null): RoomLeaseCapability {
  const v = s(raw).toLowerCase();
  if (v === 'whole_only' || v === 'wholeonly' || v === 'whole') {
    return RoomLeaseCapability.whole_only;
  }
  if (v === 'part_only' || v === 'partonly' || v === 'part' || v === 'fixed_part') {
    return RoomLeaseCapability.part_only;
  }
  return RoomLeaseCapability.flexible;
}

/** 整间出租（只能整租 / 只能分租的独立后缀房 / 可整可分的整租） */
export function roomAllowsWhole(cap: RoomLeaseCapability | string): boolean {
  const c = normalizeLeaseCapability(String(cap));
  // part_only：旧系统用 6SPi09A/B 等独立房间表示份位，签约时按整间占用该房间
  return (
    c === RoomLeaseCapability.whole_only ||
    c === RoomLeaseCapability.part_only ||
    c === RoomLeaseCapability.flexible
  );
}

/** 同一房间内按 A/B/C 份位分租（仅可整可分） */
export function roomAllowsPart(cap: RoomLeaseCapability | string): boolean {
  return normalizeLeaseCapability(String(cap)) === RoomLeaseCapability.flexible;
}

/** 是否配置/展示份位标签（仅可整可分） */
export function roomHasSplitParts(cap: RoomLeaseCapability | string): boolean {
  return roomAllowsPart(cap);
}

/** 新建/导入时根据入参解析租赁能力与份位 */
export function resolveRoomLeaseFields(input: {
  roomCode: string;
  leaseCapability?: string | null;
  splitLabels?: unknown;
  splitCount?: number | null;
  subleaseMark?: string | null;
}) {
  const roomCode = s(input.roomCode);
  const cap = normalizeLeaseCapability(input.leaseCapability);

  // 只能整租、只能分租：无份位列表（分租用独立后缀房间，如 6SPi09A / 6SPi09B）
  if (cap === RoomLeaseCapability.whole_only || cap === RoomLeaseCapability.part_only) {
    return {
      leaseCapability: cap,
      splitLabels: [] as string[],
      subleaseMark: s(input.subleaseMark) || detectFixedPartLabel(roomCode) || null,
    };
  }

  let labels = normalizeSplitLabels(input.splitLabels);
  if (!labels.length && input.splitCount != null) {
    labels = defaultSplitLabels(Number(input.splitCount));
  }
  if (!labels.length) labels = defaultSplitLabels(2);

  return {
    leaseCapability: RoomLeaseCapability.flexible,
    splitLabels: labels,
    subleaseMark: s(input.subleaseMark) || null,
  };
}

export function normalizeOccupancyMode(raw?: string | null): OccupancyMode {
  const v = s(raw).toLowerCase();
  return v === 'part' ? 'part' : 'whole';
}

/** 发票/展示用房间后缀：整租=房间号；分租=房间号+份位 */
export function invoiceRoomSuffix(input: {
  roomCode: string;
  leaseCapability: RoomLeaseCapability | string;
  occupancyMode: string;
  partLabel?: string | null;
}): string {
  const roomCode = s(input.roomCode);
  if (!roomCode) return '';
  const mode = normalizeOccupancyMode(input.occupancyMode);
  const part = s(input.partLabel).toUpperCase();
  if (mode === 'part' && part) {
    if (roomCode.toUpperCase().endsWith(part)) return roomCode;
    return `${roomCode}${part}`;
  }
  return roomCode;
}

/** 合约自动编号主体：分租时用 房间号+份位 */
export function contractCodeRoomBase(input: {
  roomCode: string;
  leaseCapability: RoomLeaseCapability | string;
  occupancyMode: string;
  partLabel?: string | null;
}): string {
  return invoiceRoomSuffix(input);
}

type OccupyingContract = {
  id: string;
  contractCode: string;
  status: string;
  occupancyMode: string;
  partLabel: string;
  customerName?: string;
};

export function buildRoomOccupancy(
  room: { leaseCapability: RoomLeaseCapability | string; splitLabels: string[] },
  contracts: OccupyingContract[],
): RoomOccupancyDto {
  const cap = normalizeLeaseCapability(String(room.leaseCapability));
  const whole = contracts.find((c) => normalizeOccupancyMode(c.occupancyMode) === 'whole');
  const labels =
    cap === RoomLeaseCapability.flexible ? normalizeSplitLabels(room.splitLabels) : [];

  if (whole) {
    return {
      summary: 'whole',
      wholeOccupied: true,
      wholeContractId: whole.id,
      wholeContractCode: whole.contractCode,
      wholeCustomerName: whole.customerName,
      wholeStatus: whole.status,
      slots: labels.map((label) => ({ label, occupied: true })),
    };
  }

  const byPart = new Map<string, OccupyingContract>();
  for (const c of contracts) {
    if (normalizeOccupancyMode(c.occupancyMode) !== 'part') continue;
    const label = s(c.partLabel).toUpperCase();
    if (!label) continue;
    if (!byPart.has(label)) byPart.set(label, c);
  }

  // 只能整租 / 只能分租（独立后缀房）：无份位列表，有占用合约即视为整间占用
  if (cap === RoomLeaseCapability.whole_only || cap === RoomLeaseCapability.part_only) {
    const hit = contracts[0];
    if (!hit) {
      return { summary: 'idle', wholeOccupied: false, slots: [] };
    }
    return {
      summary: 'whole',
      wholeOccupied: true,
      wholeContractId: hit.id,
      wholeContractCode: hit.contractCode,
      wholeCustomerName: hit.customerName,
      wholeStatus: hit.status,
      slots: [],
    };
  }

  const slots: OccupancySlotDto[] = labels.map((label) => {
    const hit = byPart.get(label);
    return hit
      ? {
          label,
          occupied: true,
          contractId: hit.id,
          contractCode: hit.contractCode,
          customerName: hit.customerName,
          status: hit.status,
        }
      : { label, occupied: false };
  });

  const occupiedCount = slots.filter((x) => x.occupied).length;
  let summary: RoomOccupancyDto['summary'] = 'idle';
  if (occupiedCount <= 0) summary = 'idle';
  else if (occupiedCount >= slots.length && slots.length > 0) summary = 'full';
  else summary = 'partial';

  return {
    summary,
    wholeOccupied: false,
    slots,
  };
}

/** 由占用合约聚合房间状态 */
export function aggregateRoomStatus(contracts: { status: string }[]): RoomStatus {
  if (!contracts.length) return RoomStatus.idle;
  const mapped = contracts.map((c) => ROOM_STATUS_BY_CONTRACT[c.status] ?? RoomStatus.leased);
  if (mapped.includes(RoomStatus.terminating)) return RoomStatus.terminating;
  if (mapped.includes(RoomStatus.leased)) return RoomStatus.leased;
  if (mapped.includes(RoomStatus.signing)) return RoomStatus.signing;
  return RoomStatus.idle;
}

const ROOM_STATUS_BY_CONTRACT: Record<string, RoomStatus> = {
  簽約中: RoomStatus.signing,
  已簽約: RoomStatus.signing,
  交吉中: RoomStatus.signing,
  租賃中: RoomStatus.leased,
  已續約: RoomStatus.leased,
  退租中: RoomStatus.terminating,
};

function s(v?: string | null) {
  return (v ?? '').trim();
}

export { toYmd as dateOnlyYmd };
