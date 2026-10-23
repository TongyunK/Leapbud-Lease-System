import { RoomConfigOption, Prisma } from '@prisma/client';
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit';

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

export type RoomConfigWithAudit = RoomConfigOption & {
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const roomConfigAuditInclude = auditUserInclude;

export function toRoomConfigDto(row: RoomConfigWithAudit) {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    minSqft: decimalToNumber(row.minSqft),
    maxSqft: decimalToNumber(row.maxSqft),
    brand: row.brand,
    model: row.model,
    sortOrder: row.sortOrder,
    active: row.active,
    createdBy: auditActorLabel(row.createdByUser),
    createdAt: formatDateTime(row.createdAt),
    updatedBy: auditActorLabel(row.updatedByUser),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 由区间生成默认展示文案（呎） */
export function buildSizeLabel(minSqft: number | null | undefined, maxSqft: number | null | undefined): string {
  const min = minSqft == null ? null : Number(minSqft);
  const max = maxSqft == null ? null : Number(maxSqft);
  if (min != null && max != null) return `${min}-${max}呎`;
  if (min != null && max == null) return `${min}呎以上`;
  if (min == null && max != null) return `${max}呎以下`;
  return '';
}
