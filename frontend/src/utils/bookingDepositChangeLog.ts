/**
 * 定金收据 changeLog 行格式化（展示用；库内仍存机器可读 `#bd|…`）。
 * 新格式：#bd|apply|YYYY-MM-DD|amount|invoiceCode
 *         #bd|refund|YYYY-MM-DD|amount
 *         #bd|refund_term|YYYY-MM-DD|amount
 *         #bd|top_up|YYYY-MM-DD|amount
 *         #bd|forfeit|YYYY-MM-DD|amount
 *         #bd|apply_vacate_excess|YYYY-MM-DD|amount|invoiceCode
 *         #bd|transfer_out|YYYY-MM-DD|amount|toContractCode
 *         #bd|transfer_in|YYYY-MM-DD|amount|fromContractCode
 * 旧自由文本尽量解析；无法识别则原样展示。
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

/** 是否为结构化修改记录（勿当普通备注编辑） */
export function isStructuredBookingDepositChangeLog(changeLog?: string | null) {
  const text = (changeLog || '').trim()
  if (!text) return false
  return text.split(/\r?\n/).some((line) => line.trim().startsWith('#bd|'))
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

export type ChangeLogRefMaps = {
  /** 旧数据曾写入发票 ID，展示时映射为编号 */
  invoiceCodeById?: Map<string, string> | Record<string, string>
}

function resolveRef(
  raw: string,
  map?: Map<string, string> | Record<string, string>,
): string {
  const ref = (raw || '').trim()
  if (!ref || !map) return ref
  if (map instanceof Map) return map.get(ref) || ref
  return map[ref] || ref
}

export function formatBookingDepositChangeLogLine(
  line: string,
  t: ChangeLogTranslate,
  refs?: ChangeLogRefMaps,
): string {
  const raw = (line || '').trim()
  if (!raw) return ''
  if (raw.startsWith('#bd|')) {
    const parts = raw.split('|')
    const kind = parts[1] || ''
    const date = parts[2] || ''
    const amount = moneyText(parts[3] || '0')
    const ref = resolveRef(parts[4] || '', refs?.invoiceCodeById)

    if (kind === 'apply') {
      return t('receipt.bookingDeposit.changeLogApply', {
        date,
        amount,
        invoice: ref || '—',
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
    if (kind === 'forfeit') {
      return t('receipt.bookingDeposit.changeLogForfeit', { date, amount })
    }
    if (kind === 'apply_vacate_excess') {
      return t('receipt.bookingDeposit.changeLogVacateExcess', {
        date,
        amount,
        invoice: ref || '—',
      })
    }
    if (kind === 'transfer_out') {
      return ref
        ? t('receipt.bookingDeposit.changeLogTransferOut', {
            date,
            amount,
            contract: ref,
          })
        : t('receipt.bookingDeposit.changeLogTransferOutPlain', { date, amount })
    }
    if (kind === 'transfer_in') {
      return ref
        ? t('receipt.bookingDeposit.changeLogTransferIn', {
            date,
            amount,
            contract: ref,
          })
        : t('receipt.bookingDeposit.changeLogTransferInPlain', { date, amount })
    }
    return t('receipt.bookingDeposit.changeLogUnknown', {
      date: date || '—',
      kind: kind || '—',
      amount,
    })
  }

  return formatLegacyApplyLine(raw, t) || formatLegacyRefundLine(raw, t) || raw
}

export function formatBookingDepositChangeLog(
  changeLog: string | null | undefined,
  t: ChangeLogTranslate,
  refs?: ChangeLogRefMaps,
): string {
  const text = (changeLog || '').trim()
  if (!text) return ''
  return text
    .split(/\r?\n/)
    .map((line) => formatBookingDepositChangeLogLine(line, t, refs))
    .filter(Boolean)
    .join('\n')
}
