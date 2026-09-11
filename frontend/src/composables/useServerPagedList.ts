import { ref, watch, type Ref } from 'vue'
import { LIST_PAGE_SIZES, EXPORT_PAGE_SIZE } from '@/types/pagination'
import type { PaginatedResult } from '@/types/pagination'
import type { DateRangeValue } from '@/composables/useTableSortFilter'

type FetchPage<T, Q> = (query: Q) => Promise<{ data: PaginatedResult<T> }>

type SortFilterApi = {
  filters: Record<string, string[]>
  dateRanges: Record<string, DateRangeValue>
  dateRangeOf: (key: string) => DateRangeValue
  sortKey: Ref<string | null>
  sortOrder: Ref<'asc' | 'desc' | null>
  clearAll: () => void
}

/**
 * 服务端分页列表：keyword / 表头筛选排序变化时重新请求；导出可按页拉取。
 */
export function useServerPagedList<T, Q extends { page?: number; pageSize?: number }>(options: {
  keyword: Ref<string>
  sortFilter: SortFilterApi
  buildQuery: (base: {
    keyword?: string
    sortBy?: string
    sortDir?: 'asc' | 'desc'
    page: number
    pageSize: number
    range: (key: string) => { from?: string; to?: string }
    filters: Record<string, string[]>
  }) => Q
  fetchPage: FetchPage<T, Q>
  initialPageSize?: number
}) {
  const loading = ref(false)
  const exporting = ref(false)
  const list = ref<T[]>([]) as Ref<T[]>
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(options.initialPageSize ?? 20)
  const pageSizes = LIST_PAGE_SIZES

  let keywordTimer: ReturnType<typeof setTimeout> | null = null
  let suppressWatch = false

  function rowIndex(indexOnPage: number) {
    return (page.value - 1) * pageSize.value + indexOnPage + 1
  }

  function resetPage() {
    page.value = 1
  }

  function rangePair(key: string): { from?: string; to?: string } {
    const range = options.sortFilter.dateRangeOf(key)
    if (!range?.[0] || !range?.[1]) return {}
    return { from: range[0], to: range[1] }
  }

  function buildListQuery(overrides?: Partial<Q>): Q {
    const q = options.buildQuery({
      keyword: options.keyword.value.trim() || undefined,
      sortBy: options.sortFilter.sortKey.value || undefined,
      sortDir: options.sortFilter.sortOrder.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
      range: rangePair,
      filters: options.sortFilter.filters,
    })
    return { ...q, ...overrides }
  }

  async function loadList() {
    loading.value = true
    try {
      const { data } = await options.fetchPage(buildListQuery())
      list.value = data.items
      total.value = data.total
      const maxPage = Math.max(1, Math.ceil(data.total / pageSize.value) || 1)
      if (page.value > maxPage) {
        suppressWatch = true
        page.value = maxPage
        suppressWatch = false
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchExportRows(scope: 'filtered' | 'all'): Promise<T[]> {
    const base =
      scope === 'all'
        ? ({ page: 1, pageSize: EXPORT_PAGE_SIZE } as unknown as Q)
        : buildListQuery({ page: 1, pageSize: EXPORT_PAGE_SIZE } as Partial<Q>)

    const rows: T[] = []
    let pageNo = 1
    let totalCount = Infinity
    while (rows.length < totalCount) {
      const { data } = await options.fetchPage({
        ...base,
        page: pageNo,
        pageSize: EXPORT_PAGE_SIZE,
      })
      rows.push(...data.items)
      totalCount = data.total
      if (!data.items.length) break
      pageNo += 1
    }
    return rows
  }

  watch(options.keyword, () => {
    if (suppressWatch) return
    if (keywordTimer) clearTimeout(keywordTimer)
    keywordTimer = setTimeout(() => {
      resetPage()
      void loadList()
    }, 300)
  })

  watch(
    [
      () => options.sortFilter.filters,
      () => options.sortFilter.dateRanges,
      options.sortFilter.sortKey,
      options.sortFilter.sortOrder,
    ],
    () => {
      if (suppressWatch) return
      resetPage()
      void loadList()
    },
    { deep: true },
  )

  watch(page, () => {
    if (suppressWatch) return
    void loadList()
  })

  watch(pageSize, () => {
    if (suppressWatch) return
    suppressWatch = true
    resetPage()
    suppressWatch = false
    void loadList()
  })

  function onClearFilters() {
    suppressWatch = true
    if (keywordTimer) clearTimeout(keywordTimer)
    options.sortFilter.clearAll()
    options.keyword.value = ''
    resetPage()
    suppressWatch = false
    void loadList()
  }

  return {
    loading,
    exporting,
    list,
    total,
    page,
    pageSize,
    pageSizes,
    rowIndex,
    resetPage,
    loadList,
    fetchExportRows,
    buildListQuery,
    onClearFilters,
    EXPORT_PAGE_SIZE,
  }
}
