import { computed, ref, watch, type Ref } from 'vue'

const DEFAULT_PAGE_SIZE = 20
const PAGE_SIZES = [10, 20, 50, 100]

/**
 * 前端列表分页：对过滤后的全量数据切片
 */
export function useClientPagination<T>(source: Ref<T[]>, options?: { pageSize?: number }) {
  const page = ref(1)
  const pageSize = ref(options?.pageSize ?? DEFAULT_PAGE_SIZE)

  watch(
    source,
    () => {
      const maxPage = Math.max(1, Math.ceil(source.value.length / pageSize.value) || 1)
      if (page.value > maxPage) page.value = maxPage
    },
    { deep: false },
  )

  watch(pageSize, () => {
    page.value = 1
  })

  const paged = computed(() => {
    const start = (page.value - 1) * pageSize.value
    return source.value.slice(start, start + pageSize.value)
  })

  const from = computed(() => {
    if (!source.value.length) return 0
    return (page.value - 1) * pageSize.value + 1
  })

  const to = computed(() => {
    if (!source.value.length) return 0
    return Math.min(page.value * pageSize.value, source.value.length)
  })

  const total = computed(() => source.value.length)

  /** 当前页序号列：全局连续编号 */
  function rowIndex(indexOnPage: number) {
    return (page.value - 1) * pageSize.value + indexOnPage + 1
  }

  function resetPage() {
    page.value = 1
  }

  return {
    page,
    pageSize,
    pageSizes: PAGE_SIZES,
    paged,
    from,
    to,
    total,
    rowIndex,
    resetPage,
  }
}
