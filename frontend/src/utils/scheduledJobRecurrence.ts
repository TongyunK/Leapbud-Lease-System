import type { ScheduledJobRecurrence } from '@/types/scheduled-job'

/** 与后端 recurrence_config JSON 对齐 */
export type ScheduledJobRecurrenceConfig = {
  weekdays?: number[]
  days?: number[]
  week?: number
  weekday?: number
  month?: number
  day?: number
}

export const RECURRENCE_OPTIONS: ScheduledJobRecurrence[] = [
  'daily',
  'weekly',
  'monthly_days',
  'monthly_weekday',
  'yearly',
]

/** 0=週日 … 6=週六 */
export const WEEKDAY_VALUES = [0, 1, 2, 3, 4, 5, 6] as const

export const MONTH_DAY_VALUES = Array.from({ length: 31 }, (_, i) => i + 1)

/** 第几个：1–4 与 -1=最後一個 */
export const WEEK_ORDINAL_VALUES = [1, 2, 3, 4, -1] as const

export function parseRecurrenceConfig(raw: string | null | undefined): ScheduledJobRecurrenceConfig {
  try {
    const o = JSON.parse(String(raw || '{}'))
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as ScheduledJobRecurrenceConfig) : {}
  } catch {
    return {}
  }
}

export function serializeRecurrenceConfig(
  recurrence: ScheduledJobRecurrence,
  cfg: ScheduledJobRecurrenceConfig,
): string {
  switch (recurrence) {
    case 'weekly':
      return JSON.stringify({
        weekdays: [...(cfg.weekdays || [])].map(Number).filter((n) => n >= 0 && n <= 6).sort((a, b) => a - b),
      })
    case 'monthly_days':
      return JSON.stringify({
        days: [...(cfg.days || [])].map(Number).filter((n) => n >= 1 && n <= 31).sort((a, b) => a - b),
      })
    case 'monthly_weekday':
      return JSON.stringify({
        week: Number(cfg.week ?? 1),
        weekday: Number(cfg.weekday ?? 1),
      })
    case 'yearly':
      return JSON.stringify({
        month: Number(cfg.month ?? 1),
        day: Number(cfg.day ?? 1),
      })
    default:
      return '{}'
  }
}

export function defaultRecurrenceConfig(
  recurrence: ScheduledJobRecurrence,
): ScheduledJobRecurrenceConfig {
  switch (recurrence) {
    case 'weekly':
      return { weekdays: [1] }
    case 'monthly_days':
      return { days: [1] }
    case 'monthly_weekday':
      return { week: 1, weekday: 1 }
    case 'yearly':
      return { month: 1, day: 1 }
    default:
      return {}
  }
}

/** MM-DD ↔ { month, day } */
export function yearlyToMmDd(cfg: ScheduledJobRecurrenceConfig): string {
  const m = Math.min(12, Math.max(1, Number(cfg.month) || 1))
  const d = Math.min(31, Math.max(1, Number(cfg.day) || 1))
  return `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function mmDdToYearly(mmdd: string): ScheduledJobRecurrenceConfig {
  const m = String(mmdd || '').match(/^(\d{1,2})-(\d{1,2})$/)
  if (!m) return { month: 1, day: 1 }
  return {
    month: Math.min(12, Math.max(1, Number(m[1]))),
    day: Math.min(31, Math.max(1, Number(m[2]))),
  }
}

export function validateRecurrenceConfig(
  recurrence: ScheduledJobRecurrence,
  cfg: ScheduledJobRecurrenceConfig,
): 'ok' | 'weekly' | 'monthly_days' | 'yearly' {
  if (recurrence === 'weekly' && !(cfg.weekdays && cfg.weekdays.length)) return 'weekly'
  if (recurrence === 'monthly_days' && !(cfg.days && cfg.days.length)) return 'monthly_days'
  if (recurrence === 'yearly' && (!cfg.month || !cfg.day)) return 'yearly'
  return 'ok'
}
