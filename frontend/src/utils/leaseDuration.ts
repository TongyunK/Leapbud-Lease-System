/** 租赁时长单位 */
export type LeaseDurationUnit = 'year' | 'month' | 'day' | 'hour'

const UNIT_ALIASES: Record<string, LeaseDurationUnit> = {
  year: 'year',
  years: 'year',
  y: 'year',
  yr: 'year',
  yrs: 'year',
  年: 'year',
  month: 'month',
  months: 'month',
  m: 'month',
  mo: 'month',
  mos: 'month',
  mth: 'month',
  mths: 'month',
  月: 'month',
  個月: 'month',
  个月: 'month',
  day: 'day',
  days: 'day',
  d: 'day',
  日: 'day',
  天: 'day',
  hour: 'hour',
  hours: 'hour',
  h: 'hour',
  時: 'hour',
  时: 'hour',
  小時: 'hour',
  小时: 'hour',
}

/** 旧系统无数字短语 → 统一换算（HALF YEAR ≈ 6 個月） */
const PHRASE_MAP: Record<string, { amount: number; unit: LeaseDurationUnit }> = {
  'half year': { amount: 6, unit: 'month' },
  halfyear: { amount: 6, unit: 'month' },
  'half-year': { amount: 6, unit: 'month' },
  半年: { amount: 6, unit: 'month' },
}

function normalizePhraseKey(raw: string): string {
  return raw.trim().replace(/[\s_]+/g, ' ').toLowerCase()
}

function resolveUnit(token: string): LeaseDurationUnit | undefined {
  const t = token.trim()
  if (!t) return undefined
  return UNIT_ALIASES[t.toLowerCase()] || UNIT_ALIASES[t]
}

/** 解析历史自由文本（如 1YEAR / 12個月 / 6MTHS / HALF YEAR） */
export function parseLeaseDuration(raw?: string | null): {
  amount: number | null
  unit: LeaseDurationUnit
} {
  const s = String(raw ?? '').trim()
  if (!s) return { amount: null, unit: 'month' }

  const phrase = PHRASE_MAP[normalizePhraseKey(s)]
  if (phrase) return phrase

  // 数字 + 单位：6MTHS / 1 YEAR / 12個月 / 1年
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z\u4e00-\u9fff]+)$/)
  if (!m) return { amount: null, unit: 'month' }
  const amount = Number(m[1])
  const unit = resolveUnit(m[2])
  if (!Number.isFinite(amount) || amount <= 0 || !unit) {
    return { amount: null, unit: 'month' }
  }
  return { amount, unit }
}

/** 存库文案：统一繁中（1年 / 12個月 / 30日 / 8時），与界面语言无关 */
export function formatLeaseDuration(
  amount: number | null | undefined,
  unit: LeaseDurationUnit,
): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return ''
  const n = Math.round(amount)
  if (unit === 'year') return `${n}年`
  if (unit === 'day') return `${n}日`
  if (unit === 'hour') return `${n}時`
  return `${n}個月`
}

type Translate = (key: string, values?: Record<string, unknown>) => string

/** 按当前语言展示（列表 / 详情）；无法解析时回退原文 */
export function displayLeaseDuration(
  raw: string | null | undefined,
  t: Translate,
): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const { amount, unit } = parseLeaseDuration(s)
  if (amount == null) return s
  const n = Number.isInteger(amount) ? amount : Math.round(amount * 100) / 100
  return t(`customerRequirement.leaseDurationDisplay.${unit}`, { n })
}
