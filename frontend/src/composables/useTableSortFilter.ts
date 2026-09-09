import { reactive, ref } from 'vue'

export type SortOrder = 'asc' | 'desc' | null

export type ColumnOption = {
  label: string
  value: string
}

export type ColumnGetterMap<T> = Record<string, (row: T) => string | number | boolean | null | undefined>

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), 'zh-Hant', { numeric: true, sensitivity: 'base' })
}

/**
 * 表头排序 + 多选筛选（单列排序；筛选可多列并存）
 */
export function useTableSortFilter<T>() {
  const sortKey = ref<string | null>(null)
  const sortOrder = ref<SortOrder>(null)
  const filters = reactive<Record<string, string[]>>({})

  function setFilter(key: string, values: string[]) {
    filters[key] = [...values]
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

  function apply(rows: T[], getters: ColumnGetterMap<T>): T[] {
    let result = rows

    for (const [key, selected] of Object.entries(filters)) {
      if (!selected?.length) continue
      const get = getters[key]
      if (!get) continue
      const set = new Set(selected.map(String))
      result = result.filter((row) => set.has(String(get(row) ?? '')))
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
    setFilter,
    setSort,
    sortOrderOf,
    apply,
    uniqueOptions,
  }
}
