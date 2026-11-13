/**
 * 发票 changeLog 行格式化。
 * 新格式：#inv|contract_sync|deposit|YYYY-MM-DD HH:mm:ss|prev|next|invoiceCode
 *         #inv|contract_sync|first_rent|YYYY-MM-DD HH:mm:ss|prev|next|invoiceCode
 * 旧自由文本原样展示（或尽量解析中文行）。
 */

export type ChangeLogTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string

function moneyText(raw: string) {
  const n = Number(String(raw).replace(/,/g, ''))
  if (!Number.isFinite(n)) return raw
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatLegacyContractSyncLine(raw: string, t: ChangeLogTranslate): string | null {
  // 2026-11-06 10:34:34 | 合約變更同步首期租金發票 CODE | 19000.00 → 19001.00
  const m = raw.match(
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*\|\s*合約變更同步(按金發票|首期租金發票)\s+(\S+)\s*\|\s*([\d,]+\.\d{2})\s*→\s*([\d,]+\.\d{2})\s*$/,
  )
  if (!m) return null
  return t('invoice.changeLog.contractSyncDeposit', {
    stamp: m[1]!,
    from: moneyText(m[4]!),
    to: moneyText(m[5]!),
  })
}

export function formatInvoiceChangeLogLine(line: string, t: ChangeLogTranslate): string {
  const raw = (line || '').trim()
  if (!raw) return ''
  if (raw.startsWith('#inv|')) {
    const parts = raw.split('|')
    const action = parts[1] || ''
    const kind = parts[2] || ''
    const stamp = parts[3] || ''
    const from = moneyText(parts[4] || '0')
    const to = moneyText(parts[5] || '0')
    if (action === 'contract_sync' && (kind === 'deposit' || kind === 'first_rent')) {
      return t(
        kind === 'deposit'
          ? 'invoice.changeLog.contractSyncDeposit'
          : 'invoice.changeLog.contractSyncFirstRent',
        { stamp, from, to },
      )
    }
    return raw
  }
  return formatLegacyContractSyncLine(raw, t) || raw
}

export function formatInvoiceChangeLog(
  changeLog: string | null | undefined,
  t: ChangeLogTranslate,
): string {
  const text = (changeLog || '').trim()
  if (!text) return ''
  return text
    .split(/\r?\n/)
    .map((line) => formatInvoiceChangeLogLine(line, t))
    .filter(Boolean)
    .reverse()
    .join('\n')
}
