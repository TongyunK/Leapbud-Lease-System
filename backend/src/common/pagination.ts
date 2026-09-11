import { Prisma } from '@prisma/client';

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function parsePage(page?: number | string): number {
  return Math.max(1, Math.floor(Number(page) || 1));
}

/** pageSize 省略时表示不分页（一次返回全部，仍包在 PaginatedResult 里） */
export function parsePageSize(
  pageSize?: number | string,
  opts?: { defaultSize?: number; max?: number; allowAll?: boolean },
): number | null {
  const max = opts?.max ?? 500;
  if (pageSize === undefined || pageSize === null || pageSize === '') {
    return opts?.allowAll === false ? opts?.defaultSize ?? 20 : null;
  }
  return Math.min(max, Math.max(1, Math.floor(Number(pageSize) || opts?.defaultSize || 20)));
}

export function parseSortDir(sortDir?: string): Prisma.SortOrder | undefined {
  if (sortDir === 'desc') return 'desc';
  if (sortDir === 'asc') return 'asc';
  return undefined;
}

export function splitCsv(raw?: string): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const list = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

/**
 * 日期范围 → Prisma DateTimeFilter。
 * endInclusiveDay=true 时结束日含当天 23:59:59.999（适合时间戳列）。
 */
export function dateRangeFilter(
  from?: string,
  to?: string,
  endInclusiveDay = false,
): Prisma.DateTimeFilter | undefined {
  const fromRaw = (from ?? '').trim();
  const toRaw = (to ?? '').trim();
  if (!fromRaw && !toRaw) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (fromRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw)) return undefined;
    filter.gte = new Date(`${fromRaw}T00:00:00.000Z`);
  }
  if (toRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) return undefined;
    filter.lte = endInclusiveDay
      ? new Date(`${toRaw}T23:59:59.999Z`)
      : new Date(`${toRaw}T00:00:00.000Z`);
  }
  return filter;
}

export function paginateArgs(page: number, pageSize: number | null): { skip?: number; take?: number } {
  if (pageSize == null) return {};
  return { skip: (page - 1) * pageSize, take: pageSize };
}
