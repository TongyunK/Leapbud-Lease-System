export type PaginatedResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type ListSortDir = 'asc' | 'desc'

export const LIST_PAGE_SIZES = [10, 20, 50, 100]
export const EXPORT_PAGE_SIZE = 500
