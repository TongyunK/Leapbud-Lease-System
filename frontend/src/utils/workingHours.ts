/** Canonical storage: "Mon-Fri 09:00-18:00" or "Mon,Wed,Fri 10:00-17:00" */

export const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number]

const WEEKDAY_ALIASES: Record<string, WeekdayKey> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

export type WorkingHoursParts = {
  days: WeekdayKey[]
  start: string
  end: string
}

function normalizeTimeToken(raw: string): string | null {
  const s = raw.trim().toLowerCase()
  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (ampm) {
    let h = Number(ampm[1])
    const m = Number(ampm[2] || '0')
    const ap = ampm[3]
    if (ap === 'pm' && h < 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const hm = s.match(/^(\d{1,2}):(\d{2})$/)
  if (hm) {
    const h = Number(hm[1])
    const m = Number(hm[2])
    if (h > 23 || m > 59) return null
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  return null
}

function expandDayRange(from: WeekdayKey, to: WeekdayKey): WeekdayKey[] {
  const a = WEEKDAY_KEYS.indexOf(from)
  const b = WEEKDAY_KEYS.indexOf(to)
  if (a < 0 || b < 0) return []
  if (a <= b) return WEEKDAY_KEYS.slice(a, b + 1)
  return [...WEEKDAY_KEYS.slice(a), ...WEEKDAY_KEYS.slice(0, b + 1)]
}

function parseDaysToken(token: string): WeekdayKey[] {
  const raw = token.trim()
  if (!raw) return []
  const range = raw.match(/^([A-Za-z]+)\s*[-–—]\s*([A-Za-z]+)$/)
  if (range) {
    const from = WEEKDAY_ALIASES[range[1].toLowerCase()]
    const to = WEEKDAY_ALIASES[range[2].toLowerCase()]
    if (from && to) return expandDayRange(from, to)
  }
  const parts = raw.split(/[,/、]+/).map((p) => p.trim()).filter(Boolean)
  const days: WeekdayKey[] = []
  for (const p of parts) {
    const key = WEEKDAY_ALIASES[p.toLowerCase()]
    if (key && !days.includes(key)) days.push(key)
  }
  return days
}

export function parseWorkingHours(value: string | null | undefined): WorkingHoursParts {
  const empty: WorkingHoursParts = { days: [], start: '09:00', end: '18:00' }
  const s = (value || '').trim()
  if (!s) return empty

  const m = s.match(/^(.+?)\s+(\S+)\s*[-–—]\s*(\S+)$/)
  if (!m) return empty
  const days = parseDaysToken(m[1])
  const start = normalizeTimeToken(m[2])
  const end = normalizeTimeToken(m[3])
  if (!days.length || !start || !end) return empty
  return { days, start, end }
}

function compactDays(days: WeekdayKey[]): string {
  if (!days.length) return ''
  const ordered = WEEKDAY_KEYS.filter((d) => days.includes(d))
  if (ordered.length === 1) return ordered[0]
  // consecutive?
  const idxs = ordered.map((d) => WEEKDAY_KEYS.indexOf(d))
  let consecutive = true
  for (let i = 1; i < idxs.length; i++) {
    if (idxs[i] !== idxs[i - 1] + 1) {
      consecutive = false
      break
    }
  }
  if (consecutive && ordered.length >= 2) {
    return `${ordered[0]}-${ordered[ordered.length - 1]}`
  }
  return ordered.join(',')
}

export function formatWorkingHours(parts: WorkingHoursParts): string {
  if (!parts.days.length || !parts.start || !parts.end) return ''
  return `${compactDays(parts.days)} ${parts.start}-${parts.end}`
}
