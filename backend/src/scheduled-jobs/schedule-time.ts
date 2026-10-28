/** Asia/Hong_Kong 时区下的调度时间辅助 */

const TZ = 'Asia/Hong_Kong'

export type HkParts = {
  y: number
  m: number
  d: number
  hour: number
  minute: number
  second: number
  /** 0=周日 … 6=周六 */
  weekday: number
}

/** recurrenceConfig JSON 结构 */
export type RecurrenceConfig = {
  /** weekly：星期几 0=日…6=六 */
  weekdays?: number[]
  /** monthly_days：每月几号 1–31 */
  days?: number[]
  /** monthly_weekday：第几个（1–4；-1=最后一个） */
  week?: number
  /** monthly_weekday：星期几 0=日…6=六 */
  weekday?: number
  /** yearly：月 1–12 */
  month?: number
  /** yearly：日 1–31 */
  day?: number
}

export function parseRunTime(runTime: string): { hour: number; minute: number } {
  const m = String(runTime || '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return { hour: 1, minute: 0 }
  const hour = Math.min(23, Math.max(0, Number(m[1])))
  const minute = Math.min(59, Math.max(0, Number(m[2])))
  return { hour, minute }
}

export function parseRecurrenceConfig(raw: string | null | undefined): RecurrenceConfig {
  try {
    const o = JSON.parse(String(raw || '{}'))
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as RecurrenceConfig) : {}
  } catch {
    return {}
  }
}

export function hkParts(now = new Date()): HkParts {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  })
  const parts = fmt.formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || ''
  const wdMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: wdMap[get('weekday')] ?? 0,
  }
}

/** 构造 HK 墙钟对应的瞬时（HK=UTC+8 无夏令时） */
export function hkWallToUtcDate(
  y: number,
  m: number,
  d: number,
  hour: number,
  minute: number,
  second = 0,
): Date {
  return new Date(Date.UTC(y, m - 1, d, hour - 8, minute, second))
}

export function addDaysHk(
  y: number,
  m: number,
  d: number,
  days: number,
): { y: number; m: number; d: number } {
  const utc = Date.UTC(y, m - 1, d + days)
  const dt = new Date(utc)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 该日在当月是第几个「同星期几」（1–5） */
function weekdayOrdinalInMonth(d: number): number {
  return Math.ceil(d / 7)
}

/** 该日是否为当月最后一个「同星期几」 */
function isLastWeekdayOfMonth(y: number, m: number, d: number): boolean {
  const next = addDaysHk(y, m, d, 7)
  return next.m !== m
}

function dateMatchesRecurrence(
  y: number,
  m: number,
  d: number,
  weekday: number,
  recurrence: string,
  cfg: RecurrenceConfig,
): boolean {
  switch (recurrence) {
    case 'daily':
      return true
    case 'weekly': {
      const days = (cfg.weekdays || []).map(Number).filter((n) => n >= 0 && n <= 6)
      return days.length > 0 && days.includes(weekday)
    }
    case 'monthly_days': {
      const days = (cfg.days || []).map(Number).filter((n) => n >= 1 && n <= 31)
      return days.length > 0 && days.includes(d)
    }
    case 'monthly_weekday': {
      const week = Number(cfg.week)
      const wd = Number(cfg.weekday)
      if (!Number.isFinite(wd) || wd !== weekday) return false
      if (week === -1) return isLastWeekdayOfMonth(y, m, d)
      return weekdayOrdinalInMonth(d) === week
    }
    case 'yearly': {
      const month = Number(cfg.month)
      const day = Number(cfg.day)
      if (!Number.isFinite(month) || !Number.isFinite(day)) return false
      return month === m && day === d
    }
    default:
      return false
  }
}

/** 当前 HK 分钟是否匹配 runTime */
export function matchesRunTimeNow(runTime: string, now = new Date()): boolean {
  const { hour, minute } = parseRunTime(runTime)
  const p = hkParts(now)
  return p.hour === hour && p.minute === minute
}

/** 当前是否到达该任务的调度点（时刻 + 周期） */
export function matchesScheduleNow(
  recurrence: string,
  runTime: string,
  configRaw: string | null | undefined,
  now = new Date(),
): boolean {
  if (!matchesRunTimeNow(runTime, now)) return false
  const p = hkParts(now)
  return dateMatchesRecurrence(
    p.y,
    p.m,
    p.d,
    p.weekday,
    recurrence || 'daily',
    parseRecurrenceConfig(configRaw),
  )
}

/**
 * 计算下一次运行时刻（HK）。
 * 从「今天或明天起」按日扫描，最多 400 天。
 */
export function nextRecurringRunAt(
  recurrence: string,
  runTime: string,
  configRaw: string | null | undefined,
  now = new Date(),
): Date {
  const { hour, minute } = parseRunTime(runTime)
  const cfg = parseRecurrenceConfig(configRaw)
  const kind = recurrence || 'daily'
  const p0 = hkParts(now)

  for (let i = 0; i < 400; i++) {
    const day = addDaysHk(p0.y, p0.m, p0.d, i)
    // 无效日期（如 2/30）跳过：用墙钟反推校验
    if (day.d > daysInMonth(day.y, day.m)) continue
    const candidate = hkWallToUtcDate(day.y, day.m, day.d, hour, minute, 0)
    if (candidate.getTime() <= now.getTime()) continue
    const wp = hkParts(candidate)
    if (dateMatchesRecurrence(wp.y, wp.m, wp.d, wp.weekday, kind, cfg)) {
      return candidate
    }
  }
  // 兜底：一天后
  const n = addDaysHk(p0.y, p0.m, p0.d, 1)
  return hkWallToUtcDate(n.y, n.m, n.d, hour, minute, 0)
}

/** @deprecated 使用 nextRecurringRunAt(..., 'daily', ...) */
export function nextDailyRunAt(runTime: string, now = new Date()): Date {
  return nextRecurringRunAt('daily', runTime, '{}', now)
}

export function formatHkDateTime(d: Date | null | undefined): string | null {
  if (!d) return null
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .format(d)
    .replace(' ', ' ')
}
