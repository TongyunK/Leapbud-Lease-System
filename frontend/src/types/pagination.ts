export type PaginatedResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type ListSortDir = 'asc' | 'desc'

export const LIST_PAGE_SIZES = [10, 20, 30, 50, 100]
/** 列表表格默认每页条数 */
export const DEFAULT_LIST_PAGE_SIZE = 30
export const EXPORT_PAGE_SIZE = 500
