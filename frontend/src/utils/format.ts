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
