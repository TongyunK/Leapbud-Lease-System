import { computed, reactive, ref } from 'vue'

export type SortOrder = 'asc' | 'desc' | null

export type ColumnOption = {
  label: string
  value: string
}

/** 日期范围筛选：[开始日 YYYY-MM-DD, 结束日 YYYY-MM-DD] */
export type DateRangeValue = [string, string] | null

export type ColumnGetterMap<T> = Record<string, (row: T) => string | number | boolean | null | undefined>

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), 'zh-Hant', { numeric: true, sensitivity: 'base' })
}

function parseToTime(raw: unknown): number {
  if (raw == null || raw === '') return Number.NaN
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : Number.NaN
  const s = String(raw).trim()
  if (!s) return Number.NaN
  // YYYY-MM-DD → 本地日初，避免仅日期被当成 UTC 午夜
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  const t = new Date(s).getTime()
  return Number.isNaN(t) ? Number.NaN : t
}

function rangeBounds(range: [string, string]): { start: number; end: number } | null {
  const startDay = parseToTime(range[0])
  const endDay = parseToTime(range[1])
  if (Number.isNaN(startDay) || Number.isNaN(endDay)) return null
  const start = Math.min(startDay, endDay)
  const endDate = new Date(Math.max(startDay, endDay))
  endDate.setHours(23, 59, 59, 999)
  return { start, end: endDate.getTime() }
}

/**
 * 表头排序 + 多选筛选 + 日期范围筛选（单列排序；筛选可多列并存）
 */
export function useTableSortFilter<T>() {
  const sortKey = ref<string | null>(null)
  const sortOrder = ref<SortOrder>(null)
  const filters = reactive<Record<string, string[]>>({})
  const dateRanges = reactive<Record<string, DateRangeValue>>({})

  function setFilter(key: string, values: string[]) {
    filters[key] = [...values]
  }

  function setDateRange(key: string, range: DateRangeValue) {
    dateRanges[key] = range && range[0] && range[1] ? [range[0], range[1]] : null
  }

  function dateRangeOf(key: string): DateRangeValue {
    return dateRanges[key] ?? null
  }

  function setSort(key: string, order: SortOrder) {
    if (!order) {
      sortKey.value = null
      sortOrder.value = null
      return
    }
    sortKey.value = key
    sortOrder.value = order
  }

  function sortOrderOf(key: string): SortOrder {
    return sortKey.value === key ? sortOrder.value : null
  }

  /** 已套用条件的列数（多选筛选 / 日期范围 / 排序各计 1） */
  const activeConditionCount = computed(() => {
    let n = 0
    for (const selected of Object.values(filters)) {
      if (selected?.length) n += 1
    }
    for (const range of Object.values(dateRanges)) {
      if (range?.[0] && range?.[1]) n += 1
    }
    if (sortKey.value && sortOrder.value) n += 1
    return n
  })

  function clearAll() {
    for (const key of Object.keys(filters)) {
      filters[key] = []
    }
    for (const key of Object.keys(dateRanges)) {
      dateRanges[key] = null
    }
    sortKey.value = null
    sortOrder.value = null
  }

  function apply(rows: T[], getters: ColumnGetterMap<T>): T[] {
    let result = rows

    for (const [key, selected] of Object.entries(filters)) {
      if (!selected?.length) continue
      const get = getters[key]
      if (!get) continue
      const set = new Set(selected.map(String))
      result = result.filter((row) => set.has(String(get(row) ?? '')))
    }

    for (const [key, range] of Object.entries(dateRanges)) {
      if (!range) continue
      const bounds = rangeBounds(range)
      if (!bounds) continue
      const get = getters[key]
      if (!get) continue
      result = result.filter((row) => {
        const t = parseToTime(get(row))
        if (Number.isNaN(t)) return false
        return t >= bounds.start && t <= bounds.end
      })
    }

    if (sortKey.value && sortOrder.value) {
      const get = getters[sortKey.value]
      if (get) {
        const dir = sortOrder.value === 'asc' ? 1 : -1
        result = [...result].sort((a, b) => compareValues(get(a), get(b)) * dir)
      }
    }

    return result
  }

  function uniqueOptions(
    rows: T[],
    get: (row: T) => string | number | boolean | null | undefined,
    labelOf?: (value: string) => string,
  ): ColumnOption[] {
    const seen = new Set<string>()
    const options: ColumnOption[] = []
    for (const row of rows) {
      const raw = get(row)
      if (raw == null || raw === '') continue
      const value = String(raw)
      if (seen.has(value)) continue
      seen.add(value)
      options.push({ value, label: labelOf ? labelOf(value) : value })
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
  }

  return {
    sortKey,
    sortOrder,
    filters,
    dateRanges,
    setFilter,
    setDateRange,
    dateRangeOf,
    setSort,
    sortOrderOf,
    activeConditionCount,
    clearAll,
    apply,
    uniqueOptions,
  }
}
