/** 缴费周期切片（与 backend/src/common/billing-period.ts 对齐；前端提示用） */

export type BillingPeriodYmd = {
  start: string
  end: string
}

function parseYmd(ymd: string | null | undefined): Date | null {
  const s = (ymd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayUtc(): Date {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

export function isRentFreeDateType(dateType: string | null | undefined): boolean {
  const t = String(dateType || '').trim()
  if (!t) return false
  if (t === 'rent_free' || t === '免租期') return true
  return /免租/.test(t)
}

export function parsePaymentCycleMonths(paymentCycle: string | null | undefined): number {
  const raw = (paymentCycle || '').trim()
  if (!raw) return 1
  const m = raw.match(/-(\d+)\s*$/)
  if (m) {
    const n = Number(m[1])
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
  }
  if (raw.includes('季')) return 3
  if (raw.includes('半年')) return 6
  if (raw.includes('年半') || raw.includes('1年半')) return 18
  if (raw.includes('2年') || raw === '年繳' || raw.includes('年')) {
    if (raw.includes('2')) return 24
    return 12
  }
  return 1
}

function addMonthsUtc(date: Date, months: number): Date {
  const day = date.getUTCDate()
  const base = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
  base.setUTCDate(Math.min(day, last))
  return base
}

function billingPeriodEndInclusive(start: Date, months: number): Date {
  const nextStart = addMonthsUtc(start, months)
  return new Date(nextStart.getTime() - 24 * 60 * 60 * 1000)
}

export function rentBillingStartYmd(
  contractStartYmd: string | null | undefined,
  periods: Array<{ dateType: string; startDate: string; endDate: string; sortOrder?: number }>,
): string | null {
  const start = parseYmd(contractStartYmd)
  if (!start) return null
  if (!periods.length) return formatYmd(start)

  const sorted = [...periods].sort((a, b) => {
    const as = parseYmd(a.startDate)?.getTime() ?? 0
    const bs = parseYmd(b.startDate)?.getTime() ?? 0
    if (as !== bs) return as - bs
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  })

  let cursor = start
  for (const p of sorted) {
    if (!isRentFreeDateType(p.dateType)) break
    const ps = parseYmd(p.startDate)
    const pe = parseYmd(p.endDate)
    if (!ps || !pe) break
    if (ps.getTime() !== cursor.getTime()) break
    cursor = new Date(pe.getTime() + 24 * 60 * 60 * 1000)
  }
  return formatYmd(cursor)
}

export function listBillingPeriodsYmd(
  rangeStartYmd: string | null | undefined,
  rangeEndYmd: string | null | undefined,
  months: number,
): BillingPeriodYmd[] {
  const start = parseYmd(rangeStartYmd)
  const end = parseYmd(rangeEndYmd)
  if (!start || !end || end < start) return []
  const step = Math.max(1, Math.floor(months) || 1)
  const out: BillingPeriodYmd[] = []
  let cur = start
  let guard = 0
  while (cur <= end && guard < 500) {
    guard += 1
    const rawEnd = billingPeriodEndInclusive(cur, step)
    const clipped = rawEnd > end ? end : rawEnd
    out.push({ start: formatYmd(cur), end: formatYmd(clipped) })
    cur = addMonthsUtc(cur, step)
  }
  return out
}

/**
 * 签约中合约：是否已进入「第 2 个缴费周期」的提前开票窗口（含已过开始日）。
 * 此时不应自动开第 2 期，需提示用户先开单（状态→租赁中）。
 */
export function needsIssueBeforeSecondBilling(params: {
  status: string | null | undefined
  startDate: string | null | undefined
  endDate: string | null | undefined
  paymentCycle: string | null | undefined
  periods?: Array<{ dateType: string; startDate: string; endDate: string; sortOrder?: number }>
  leadDays?: number
  todayYmd?: string
  /** 传入后用于判断「签约中」；默认仅认 簽約中 / 已簽約 / 草稿 / 交吉中 */
  isSigning?: (status: string | null | undefined) => boolean
}): { needed: boolean; secondPeriodStart: string | null } {
  const signing =
    params.isSigning?.(params.status) ??
    ['簽約中', '已簽約', '草稿', '交吉中'].includes(String(params.status || '').trim())
  if (!signing) return { needed: false, secondPeriodStart: null }

  const billingStart = rentBillingStartYmd(params.startDate, params.periods || [])
  const months = parsePaymentCycleMonths(params.paymentCycle)
  const periods = listBillingPeriodsYmd(billingStart, params.endDate, months)
  const second = periods[1]
  if (!second) return { needed: false, secondPeriodStart: null }

  const lead = Math.max(1, Math.floor(params.leadDays ?? 7))
  const secondStart = parseYmd(second.start)
  const today = params.todayYmd ? parseYmd(params.todayYmd) : todayUtc()
  if (!secondStart || !today) return { needed: false, secondPeriodStart: second.start }

  const windowOpen = new Date(secondStart.getTime() - lead * 24 * 60 * 60 * 1000)
  if (today.getTime() < windowOpen.getTime()) {
    return { needed: false, secondPeriodStart: second.start }
  }
  return { needed: true, secondPeriodStart: second.start }
}
