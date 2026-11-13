/** 客户需求状态 ↔ 关联合约状态（归并后文案） */

const SIGNING_LIKE = new Set(['簽約中', '草稿', '交吉中', '已簽約'])
const LEASED_LIKE = new Set(['租賃中', '退租中', '已退租', '已續約', '已完成'])

/** 合约状态别名归并（与 ContractsService.canonicalStatus 对齐的主路径） */
export function canonicalContractStatusForRequirement(status?: string | null): string {
  const raw = String(status || '').trim()
  if (!raw) return ''
  const map: Record<string, string> = {
    草稿: '草稿',
    簽約中: '簽約中',
    已簽約: '簽約中',
    交吉中: '交吉中',
    租賃中: '租賃中',
    已完成: '已完成',
    退租中: '退租中',
    已退租: '已退租',
    已續約: '已續約',
    已取消: '已取消',
    cancelled: '已取消',
    canceled: '已取消',
  }
  return map[raw] || map[raw.toLowerCase()] || raw
}

/**
 * 由关联合约状态推导需求状态：
 * - 无合约 → 未跟進
 * - 有租赁中及之后态 → 已簽約
 * - 有签约中类 → 跟進中
 * - 仅已取消 → 已取消
 */
export function requirementStatusFromContractStatuses(
  contractStatuses: Array<string | null | undefined>,
): '未跟進' | '跟進中' | '已簽約' | '已取消' {
  const canons = contractStatuses
    .map((s) => canonicalContractStatusForRequirement(s))
    .filter(Boolean)
  if (!canons.length) return '未跟進'
  if (canons.some((s) => LEASED_LIKE.has(s))) return '已簽約'
  if (canons.some((s) => SIGNING_LIKE.has(s))) return '跟進中'
  if (canons.every((s) => s === '已取消')) return '已取消'
  return '未跟進'
}

/** 新增／改挂需求时允许的状态 */
export const REQUIREMENT_LINKABLE_STATUSES = new Set(['未跟進', '已取消'])
