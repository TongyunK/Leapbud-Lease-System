/** 表头「空值」筛选哨兵（出现在 options / filters 中） */
export const EMPTY_FILTER_VALUE = '__lb_empty__'

export function isEmptyFilterValue(v: unknown): boolean {
  return String(v ?? '') === EMPTY_FILTER_VALUE
}

export function isBlankCell(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  return false
}

/** 拆出普通取值与是否勾选空值，供 buildQuery 使用 */
export function splitEmptyFilter(selected?: string[] | null): {
  values: string[]
  includeEmpty: boolean
} {
  const list = (selected || []).map((v) => String(v)).filter((v) => v.length > 0)
  const includeEmpty = list.some(isEmptyFilterValue)
  const values = list.filter((v) => !isEmptyFilterValue(v))
  return { values, includeEmpty }
}

/**
 * 组装列表查询用的多选数组：普通值 + 可选空值哨兵。
 * 无任何选中时返回 undefined。
 */
export function packFilterValues(selected?: string[] | null): string[] | undefined {
  const { values, includeEmpty } = splitEmptyFilter(selected)
  if (!values.length && !includeEmpty) return undefined
  return includeEmpty ? [...values, EMPTY_FILTER_VALUE] : values
}
