import { RoomConfigOption, Prisma } from '@prisma/client';

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

export function toRoomConfigDto(row: RoomConfigOption) {
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
  };
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
