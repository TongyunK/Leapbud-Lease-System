/** 合约期单位（与 CONTRACT_PERIOD_UNITS 一致） */
export type ContractPeriodUnit = '月' | '日'

type Ymd = { y: number; m: number; d: number }

function parseYmd(s: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo, d }
}

function toYmd(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** 加月（按起始日号钳制到目标月末） */
export function addMonthsYmd(ymd: string, months: number): string {
  const p = parseYmd(ymd)
  if (!p) return ''
  const base = new Date(Date.UTC(p.y, p.m - 1 + months, 1))
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
  return toYmd(base.getUTCFullYear(), base.getUTCMonth() + 1, Math.min(p.d, last))
}

export function addDaysYmd(ymd: string, days: number): string {
  const p = parseYmd(ymd)
  if (!p) return ''
  return toYmd(p.y, p.m, p.d + days)
}

function diffDaysInclusive(start: string, end: string): number {
  const a = parseYmd(start)
  const b = parseYmd(end)
  if (!a || !b) return 0
  const t0 = Date.UTC(a.y, a.m - 1, a.d)
  const t1 = Date.UTC(b.y, b.m - 1, b.d)
  return Math.floor((t1 - t0) / 86400000) + 1
}

/**
 * 由开始日 + 单位/数值推算结束日（含首尾）。
 * 月：结束日 = 开始日 + N 个月 − 1 天；日：结束日 = 开始日 + N − 1 天。
 */
export function endDateFromDuration(
  startDate?: string | null,
  dateUnit?: string | null,
  dateValue?: number | null,
): string | null {
  const start = String(startDate || '').trim()
  if (!parseYmd(start)) return null
  const n = Math.floor(Number(dateValue) || 0)
  if (n <= 0) return null
  const unit = String(dateUnit || '').trim()
  if (unit === '月') {
    const endExclusive = addMonthsYmd(start, n)
    return endExclusive ? addDaysYmd(endExclusive, -1) : null
  }
  if (unit === '日') {
    return addDaysYmd(start, n - 1)
  }
  return null
}

/**
 * 由起止日期推算时长与单位。
 * 优先整月：结束日 = 开始日 + N 个月 − 1 天（如 2026-05-22 → 2027-05-21 = 12 月）；
 * 否则按含首尾的天数。
 */
export function inferPeriodDurationFromDates(
  startDate?: string | null,
  endDate?: string | null,
): { dateUnit: ContractPeriodUnit; dateValue: number } | null {
  const start = String(startDate || '').trim()
  const end = String(endDate || '').trim()
  if (!parseYmd(start) || !parseYmd(end) || end < start) return null

  const endPlus1 = addDaysYmd(end, 1)
  const sp = parseYmd(start)!
  const ep1 = parseYmd(endPlus1)!
  // 优先整月：结束日 = 开始日 + N 月 − 1 天（含月末钳制，如 1/31→2/27）
  const monthsGuess = (ep1.y - sp.y) * 12 + (ep1.m - sp.m)
  for (const months of [monthsGuess, monthsGuess - 1, monthsGuess + 1]) {
    if (months > 0 && addMonthsYmd(start, months) === endPlus1) {
      return { dateUnit: '月', dateValue: months }
    }
  }

  const days = diffDaysInclusive(start, end)
  if (days <= 0) return null
  return { dateUnit: '日', dateValue: days }
}

/** 两段日期（含首尾）是否重叠 */
export function periodsDateOverlap(
  a: { startDate?: string | null; endDate?: string | null },
  b: { startDate?: string | null; endDate?: string | null },
): boolean {
  const a0 = String(a.startDate || '').trim()
  const a1 = String(a.endDate || '').trim()
  const b0 = String(b.startDate || '').trim()
  const b1 = String(b.endDate || '').trim()
  if (!parseYmd(a0) || !parseYmd(a1) || !parseYmd(b0) || !parseYmd(b1)) return false
  if (a1 < a0 || b1 < b0) return false
  return a0 <= b1 && b0 <= a1
}

/**
 * 找出重叠的合约期下标对（按当前数组顺序；仅检查起止齐全的行）。
 * 返回首个冲突的 [i, j]（0-based），无冲突返回 null。
 */
export function findFirstPeriodOverlap(
  rows: Array<{ startDate?: string | null; endDate?: string | null }>,
): { i: number; j: number } | null {
  const filled: Array<{ idx: number; startDate: string; endDate: string }> = []
  for (let i = 0; i < rows.length; i++) {
    const startDate = String(rows[i].startDate || '').trim()
    const endDate = String(rows[i].endDate || '').trim()
    if (!parseYmd(startDate) || !parseYmd(endDate) || endDate < startDate) continue
    filled.push({ idx: i, startDate, endDate })
  }
  for (let a = 0; a < filled.length; a++) {
    for (let b = a + 1; b < filled.length; b++) {
      if (periodsDateOverlap(filled[a], filled[b])) {
        return { i: filled[a].idx, j: filled[b].idx }
      }
    }
  }
  return null
}
