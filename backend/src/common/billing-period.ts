/** 缴费周期解析与账单切片（UTC 日期） */

export type BillingPeriod = {
  /** 周期起（含） */
  start: Date
  /** 周期止（含） */
  end: Date
}

export type PeriodSpanForBilling = {
  dateType: string
  startDate: Date
  endDate: Date
  sortOrder?: number
}

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** 是否免租期（配置 code / 中文标签） */
export function isRentFreeDateType(dateType: string | null | undefined): boolean {
  const t = String(dateType || '').trim()
  if (!t) return false
  if (t === 'rent_free' || t === '免租期') return true
  return /免租/.test(t)
}

/**
 * 租金缴费起算日：跳过自合约开始日起连续的免租期，取免租结束后次日；
 * 无前缀免租期时返回合约开始日。
 */
export function rentBillingStartDate(
  contractStart: Date | null | undefined,
  periods: PeriodSpanForBilling[],
): Date | null {
  if (!contractStart) return null
  const start = utcDateOnly(contractStart)
  if (!periods.length) return start

  const sorted = [...periods].sort((a, b) => {
    const t = utcDateOnly(a.startDate).getTime() - utcDateOnly(b.startDate).getTime()
    if (t !== 0) return t
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  })

  let cursor = start
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]
    if (!isRentFreeDateType(p.dateType)) break
    const ps = utcDateOnly(p.startDate)
    const pe = utcDateOnly(p.endDate)
    // 前缀免租须从当前游标衔接（首段对齐合约开始）
    if (ps.getTime() !== cursor.getTime()) break
    cursor = new Date(pe.getTime() + 24 * 60 * 60 * 1000)
  }
  return cursor
}

/** 解析「月繳-1 / 季繳-3 / …」为月数；无法识别时默认 1 */
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

/** 同日加月（处理月末溢出：1/31 +1月 → 2/28） */
export function addMonthsUtc(date: Date, months: number): Date {
  const d = utcDateOnly(date)
  const day = d.getUTCDate()
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))
  const last = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0),
  ).getUTCDate()
  base.setUTCDate(Math.min(day, last))
  return base
}

/** 周期止 = 起 + months 月 − 1 日（如 2025-03-23~2025-04-22） */
export function billingPeriodEndInclusive(start: Date, months: number): Date {
  const nextStart = addMonthsUtc(start, months)
  return new Date(nextStart.getTime() - 24 * 60 * 60 * 1000)
}

export function formatDateYmd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 旧系统服务细节：`1.Charging Period 2025-03-23~2025-04-22` */
export function chargingPeriodDetailDescription(start: Date, end: Date): string {
  return `1.Charging Period ${formatDateYmd(start)}~${formatDateYmd(end)}`
}

/**
 * 在 [rangeStart, rangeEnd] 内按缴费月数切片。
 * 最后一段若不足整周期则裁到 rangeEnd。
 */
export function listBillingPeriods(
  rangeStart: Date | null | undefined,
  rangeEnd: Date | null | undefined,
  months: number,
): BillingPeriod[] {
  if (!rangeStart || !rangeEnd) return []
  const start = utcDateOnly(rangeStart)
  const end = utcDateOnly(rangeEnd)
  if (end < start) return []
  const step = Math.max(1, Math.floor(months) || 1)
  const out: BillingPeriod[] = []
  let cur = start
  let guard = 0
  while (cur <= end && guard < 500) {
    guard += 1
    const rawEnd = billingPeriodEndInclusive(cur, step)
    const clipped = rawEnd > end ? end : rawEnd
    out.push({ start: cur, end: clipped })
    cur = addMonthsUtc(cur, step)
  }
  return out
}

/** 今天（UTC 日期）是否落在「周期开始前第 7 日」到「周期开始日」窗口（含两端） */
export function isWithinLeadWindow(
  periodStart: Date,
  today: Date,
  leadDays = 7,
): boolean {
  const start = utcDateOnly(periodStart)
  const t = utcDateOnly(today)
  const windowOpen = new Date(start.getTime() - leadDays * 24 * 60 * 60 * 1000)
  return t >= windowOpen && t <= start
}
