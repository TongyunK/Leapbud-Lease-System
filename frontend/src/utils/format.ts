/** 金额：两位小数（不带货币符号） */
export function formatMoney(n: number, currency = '') {
  const amount = formatNumber2(n)
  return currency ? `${currency} ${amount}` : amount
}

/** 普通数字：两位小数 */
export function formatNumber2(n: number) {
  return Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** 日期时间：本地时区 YYYY-MM-DD HH:mm:ss */
export function formatDateTime(value?: string | Date | null): string {
  if (value === null || value === undefined || value === '') return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
