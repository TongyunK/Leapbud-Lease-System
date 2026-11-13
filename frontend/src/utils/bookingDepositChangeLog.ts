/**
 * 定金收据 changeLog 行格式化。
 * 新格式：#bd|apply|YYYY-MM-DD|amount|invoiceCode
 *         #bd|refund|YYYY-MM-DD|amount
 *         #bd|refund_term|YYYY-MM-DD|amount
 *         #bd|top_up|YYYY-MM-DD|amount
 * 旧自由文本原样展示。
 */

export type ChangeLogTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string

function moneyText(raw: string) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** 兼容旧自由文本抵扣行 → 抽出发票号按新文案展示 */
function formatLegacyApplyLine(raw: string, t: ChangeLogTranslate): string | null {
  // 2026-11-04 抵扣 1,000.00 → 应收 ARxxx / 发票 Wxxx；余额 …
  const m = raw.match(
    /^(\d{4}-\d{2}-\d{2})\s+抵扣\s+([\d,]+\.\d{2})\s*→\s*(?:应收|應收)\s+\S+\s*\/\s*(?:发票|發票)\s+(\S+?)(?:\s*[;；].*)?$/,
  )
  if (!m) return null
  return t('receipt.bookingDeposit.changeLogApply', {
    date: m[1]!,
    amount: m[2]!,
    invoice: m[3]!,
  })
}

function formatLegacyRefundLine(raw: string, t: ChangeLogTranslate): string | null {
  const term = raw.match(
    /^(\d{4}-\d{2}-\d{2})\s+退还\s+([\d,]+\.\d{2}).*(?:退租一并|退租一併)/,
  )
  if (term) {
    return t('receipt.bookingDeposit.changeLogRefundTerm', {
      date: term[1]!,
      amount: term[2]!,
    })
  }
  const plain = raw.match(/^(\d{4}-\d{2}-\d{2})\s+退还\s+([\d,]+\.\d{2})/)
  if (plain) {
    return t('receipt.bookingDeposit.changeLogRefund', {
      date: plain[1]!,
      amount: plain[2]!,
    })
  }
  return null
}

export function formatBookingDepositChangeLogLine(
  line: string,
  t: ChangeLogTranslate,
): string {
  const raw = (line || '').trim()
  if (!raw) return ''
  if (raw.startsWith('#bd|')) {
    const parts = raw.split('|')
    const kind = parts[1] || ''
    const date = parts[2] || ''
    const amount = moneyText(parts[3] || '0')
    const invoiceCode = (parts[4] || '').trim()

    if (kind === 'apply') {
      return t('receipt.bookingDeposit.changeLogApply', {
        date,
        amount,
        invoice: invoiceCode || '—',
      })
    }
    if (kind === 'refund') {
      return t('receipt.bookingDeposit.changeLogRefund', { date, amount })
    }
    if (kind === 'refund_term') {
      return t('receipt.bookingDeposit.changeLogRefundTerm', { date, amount })
    }
    if (kind === 'top_up') {
      return t('receipt.bookingDeposit.changeLogTopUp', { date, amount })
    }
    return raw
  }

  return formatLegacyApplyLine(raw, t) || formatLegacyRefundLine(raw, t) || raw
}

export function formatBookingDepositChangeLog(
  changeLog: string | null | undefined,
  t: ChangeLogTranslate,
): string {
  const text = (changeLog || '').trim()
  if (!text) return ''
  return text
    .split(/\r?\n/)
    .map((line) => formatBookingDepositChangeLogLine(line, t))
    .filter(Boolean)
    .join('\n')
}
