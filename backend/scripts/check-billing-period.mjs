/** 本地校验账单周期切片（不依赖 prisma generate） */
function utcDateOnly(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
function parsePaymentCycleMonths(paymentCycle) {
  const raw = (paymentCycle || '').trim()
  const m = raw.match(/-(\d+)\s*$/)
  if (m) return Math.max(1, Math.floor(Number(m[1])) || 1)
  return 1
}
function addMonthsUtc(date, months) {
  const d = utcDateOnly(date)
  const day = d.getUTCDate()
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
  base.setUTCDate(Math.min(day, last))
  return base
}
function billingPeriodEndInclusive(start, months) {
  return new Date(addMonthsUtc(start, months).getTime() - 86400000)
}
function formatDateYmd(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
function chargingPeriodDetailDescription(start, end) {
  return `1.Charging Period ${formatDateYmd(start)}~${formatDateYmd(end)}`
}
function listBillingPeriods(rangeStart, rangeEnd, months) {
  const start = utcDateOnly(rangeStart)
  const end = utcDateOnly(rangeEnd)
  const step = Math.max(1, months)
  const out = []
  let cur = start
  let guard = 0
  while (cur <= end && guard < 500) {
    guard++
    const rawEnd = billingPeriodEndInclusive(cur, step)
    out.push({ start: cur, end: rawEnd > end ? end : rawEnd })
    cur = addMonthsUtc(cur, step)
  }
  return out
}

const start = new Date(Date.UTC(2025, 2, 23))
const end = new Date(Date.UTC(2025, 8, 22))
const periods = listBillingPeriods(start, end, parsePaymentCycleMonths('月繳-1'))
console.log(chargingPeriodDetailDescription(periods[0].start, periods[0].end))
console.log('months count', periods.length)
const q = listBillingPeriods(start, end, 3)
console.log(chargingPeriodDetailDescription(q[0].start, q[0].end))
