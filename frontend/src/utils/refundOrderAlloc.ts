import type { RefundItemRecord } from '@/types/refund-order'

export function roundMoney2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * 从退款明细 description 取展示编号。
 * 例：「W263050-TL522 Deposit 需退」→「W263050-TL522」
 */
export function refundItemDisplayCode(description: string, fallback = ''): string {
  const raw = (description || '').trim()
  if (!raw) return fallback
  if (raw === '需退') return fallback || raw
  const noDue = raw.replace(/\s*需退\s*$/u, '').trim()
  const first = noDue.split(/\s+/)[0]
  return first || noDue || fallback
}

export type RefundAllocRow = {
  key: string
  label: string
  due: number
  refundPart: number
  remainAfter: number
}

/**
 * 办理打款预览：先扣减已打金额得到各行剩余需退，再按 FIFO 分摊本次金额。
 */
export function buildRefundDisburseAllocPreview(
  items: RefundItemRecord[],
  opts: { alreadyPaid?: number; payNow: number },
): RefundAllocRow[] {
  let paidLeft = roundMoney2(Math.max(0, opts.alreadyPaid ?? 0))
  const remaining: Array<{ key: string; label: string; due: number }> = []
  for (const it of items || []) {
    const full = roundMoney2(it.amount)
    if (full <= 0.009) continue
    const covered = roundMoney2(Math.min(full, paidLeft))
    paidLeft = roundMoney2(Math.max(0, paidLeft - covered))
    const due = roundMoney2(Math.max(0, full - covered))
    if (due <= 0.009) continue
    remaining.push({
      key: it.id || `${it.sortOrder}:${it.description}`,
      label: refundItemDisplayCode(it.description, it.itemType),
      due,
    })
  }
  let left = roundMoney2(Math.max(0, opts.payNow))
  return remaining.map((item) => {
    const refundPart = roundMoney2(Math.min(item.due, left))
    left = roundMoney2(Math.max(0, left - refundPart))
    return {
      ...item,
      refundPart,
      remainAfter: roundMoney2(Math.max(0, item.due - refundPart)),
    }
  })
}

/**
 * 详情抽屉：按原明细需退额，用已打合计 FIFO 标出已退／未退。
 */
export function buildRefundOrderItemAlloc(
  items: RefundItemRecord[],
  paidAmount: number,
): RefundAllocRow[] {
  let left = roundMoney2(Math.max(0, paidAmount))
  return (items || [])
    .filter((it) => roundMoney2(it.amount) > 0.009)
    .map((it) => {
      const due = roundMoney2(it.amount)
      const refundPart = roundMoney2(Math.min(due, left))
      left = roundMoney2(Math.max(0, left - refundPart))
      return {
        key: it.id || `${it.sortOrder}:${it.description}`,
        label: refundItemDisplayCode(it.description, it.itemType),
        due,
        refundPart,
        remainAfter: roundMoney2(Math.max(0, due - refundPart)),
      }
    })
}
