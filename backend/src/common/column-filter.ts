/** 与前端 EMPTY_FILTER_VALUE 一致：表头「空值」筛选哨兵 */
export const EMPTY_FILTER_VALUE = '__lb_empty__'

export function splitEmptyFilter(values?: string[] | null): {
  values: string[]
  includeEmpty: boolean
} {
  const list = (values || []).map((v) => String(v ?? '').trim()).filter(Boolean)
  const includeEmpty = list.includes(EMPTY_FILTER_VALUE)
  return {
    values: list.filter((v) => v !== EMPTY_FILTER_VALUE),
    includeEmpty,
  }
}

/**
 * 字符串字段：in 普通值；空值按空串匹配（必填 String 不能写 null）。
 * 可选 String? 若还需 null，传 `{ nullable: true }`。
 */
export function stringFieldInOrEmpty(
  field: string,
  raw?: string[] | null,
  opts?: { nullable?: boolean },
): Record<string, unknown> | null {
  const { values, includeEmpty } = splitEmptyFilter(raw)
  if (!values.length && !includeEmpty) return null
  if (!includeEmpty) {
    return values.length === 1 ? { [field]: values[0] } : { [field]: { in: values } }
  }
  const or: Record<string, unknown>[] = [{ [field]: '' }]
  if (opts?.nullable) or.push({ [field]: null })
  if (values.length === 1) or.unshift({ [field]: values[0] })
  else if (values.length > 1) or.unshift({ [field]: { in: values } })
  return or.length === 1 ? or[0]! : { OR: or }
}

/**
 * 数值字段：in 数字。
 * 默认空值按 0（必填 Decimal/Int @default(0) 不能写 null）；
 * 可选字段传 `{ nullable: true }` 匹配 null。
 */
export function numberFieldInOrEmpty(
  field: string,
  raw?: string[] | null,
  opts?: { nullable?: boolean; emptyAs?: number },
): Record<string, unknown> | null {
  const { values, includeEmpty } = splitEmptyFilter(raw)
  const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n))
  if (!nums.length && !includeEmpty) return null
  if (!includeEmpty) {
    return nums.length === 1 ? { [field]: nums[0] } : { [field]: { in: nums } }
  }
  const emptyClause = opts?.nullable
    ? { [field]: null }
    : { [field]: opts?.emptyAs ?? 0 }
  const or: Record<string, unknown>[] = [emptyClause]
  if (nums.length === 1) or.unshift({ [field]: nums[0] })
  else if (nums.length > 1) or.unshift({ [field]: { in: nums } })
  return or.length === 1 ? or[0]! : { OR: or }
}
