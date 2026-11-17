/**
 * 发票 changeLog 行格式化（展示用；库内仍存机器可读 `#inv|…`）。
 *
 * 同一次合約取消写入的多行（同 stamp 的 void／沒收／暫留等）展示时合并为一条。
 *
 * 约定（勿用 ASCII「|」写进 i18n 文案：vue-i18n 会当复数分隔符）：
 * - #inv|contract_sync|deposit|stamp|prev|next|invoiceCode
 * - #inv|contract_sync|first_rent|stamp|prev|next|invoiceCode
 * - #inv|contract_cancel|void|stamp|invoiceCode
 * - #inv|contract_cancel|{cash_refund|cash_forfeit|cash_defer|deposit_offset_*}|stamp|amount|invoiceCode
 * - #inv|cancel_refund|{cash|deposit_offset}|stamp|amount|invoiceCode
 * - #inv|cancel_refund|remark|stamp|remarkText
 * - #inv|vacate_settlement|void_unpaid_deposit|stamp|invoiceCode|contractCode
 */

export type ChangeLogTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string

type ParsedInvLine = {
  raw: string
  action: string
  kind: string
  stamp: string
  amountRaw: string
  remark: string
}

function moneyText(raw: string) {
  const n = Number(String(raw).replace(/,/g, ''))
  if (!Number.isFinite(n)) return raw
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatLegacyContractSyncLine(raw: string, t: ChangeLogTranslate): string | null {
  const m = raw.match(
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*\|\s*合約變更同步(按金發票|首期租金發票)\s+(\S+)\s*\|\s*([\d,]+\.\d{2})\s*→\s*([\d,]+\.\d{2})\s*$/,
  )
  if (!m) return null
  const kindKey =
    m[2] === '按金發票'
      ? 'invoice.changeLog.contractSyncDeposit'
      : 'invoice.changeLog.contractSyncFirstRent'
  return t(kindKey, {
    stamp: m[1]!,
    from: moneyText(m[4]!),
    to: moneyText(m[5]!),
  })
}

function parseInvPipeLine(raw: string): ParsedInvLine | null {
  if (!raw.startsWith('#inv|')) return null
  const parts = raw.split('|')
  const action = parts[1] || ''
  const kind = parts[2] || ''
  const stamp = parts[3] || ''
  if (action === 'cancel_refund' && kind === 'remark') {
    return {
      raw,
      action,
      kind,
      stamp,
      amountRaw: '',
      remark: parts.slice(4).join('|') || '',
    }
  }
  if (action === 'contract_cancel' && kind === 'void') {
    return { raw, action, kind, stamp, amountRaw: '', remark: '' }
  }
  if (action === 'vacate_settlement' && kind === 'void_unpaid_deposit') {
    return { raw, action, kind, stamp, amountRaw: '', remark: '' }
  }
  // 金额类：第 5 段为 amount
  return {
    raw,
    action,
    kind,
    stamp,
    amountRaw: parts[4] || '0',
    remark: '',
  }
}

/** 合約取消片段展示顺序（同 stamp 合并时） */
const CONTRACT_CANCEL_KIND_ORDER = [
  'void',
  'cash_forfeit',
  'cash_defer',
  'cash_refund',
  'deposit_offset_forfeit',
  'deposit_offset_defer',
  'deposit_offset_refund',
] as const

const CONTRACT_CANCEL_FRAGMENT_KEYS: Record<string, string> = {
  void: 'invoice.changeLog.fragmentVoid',
  cash_refund: 'invoice.changeLog.fragmentCashRefund',
  cash_forfeit: 'invoice.changeLog.fragmentCashForfeit',
  cash_defer: 'invoice.changeLog.fragmentCashDefer',
  deposit_offset_refund: 'invoice.changeLog.fragmentDepOffsetRefund',
  deposit_offset_forfeit: 'invoice.changeLog.fragmentDepOffsetForfeit',
  deposit_offset_defer: 'invoice.changeLog.fragmentDepOffsetDefer',
}

function formatContractCancelFragment(kind: string, amountRaw: string, t: ChangeLogTranslate): string {
  const key = CONTRACT_CANCEL_FRAGMENT_KEYS[kind]
  if (!key) return kind
  if (kind === 'void') return t(key)
  return t(key, { amount: moneyText(amountRaw || '0') })
}

function formatContractCancelGroup(stamp: string, items: ParsedInvLine[], t: ChangeLogTranslate): string {
  const byKind = new Map<string, ParsedInvLine>()
  for (const it of items) {
    if (!byKind.has(it.kind)) byKind.set(it.kind, it)
  }
  const parts: string[] = []
  for (const kind of CONTRACT_CANCEL_KIND_ORDER) {
    const it = byKind.get(kind)
    if (!it) continue
    parts.push(formatContractCancelFragment(kind, it.amountRaw, t))
    byKind.delete(kind)
  }
  for (const it of byKind.values()) {
    parts.push(formatContractCancelFragment(it.kind, it.amountRaw, t))
  }
  return t('invoice.changeLog.contractCancelMerged', {
    stamp,
    parts: parts.join(t('invoice.changeLog.fragmentJoin')),
  })
}

function formatSingleInvLine(parsed: ParsedInvLine, t: ChangeLogTranslate): string {
  const { action, kind, stamp, amountRaw, remark } = parsed

  if (action === 'contract_sync' && (kind === 'deposit' || kind === 'first_rent')) {
    // amountRaw 实际是 prev；next 在 raw 里
    const parts = parsed.raw.split('|')
    return t(
      kind === 'deposit'
        ? 'invoice.changeLog.contractSyncDeposit'
        : 'invoice.changeLog.contractSyncFirstRent',
      {
        stamp,
        from: moneyText(parts[4] || '0'),
        to: moneyText(parts[5] || '0'),
      },
    )
  }

  if (action === 'contract_cancel') {
    return formatContractCancelGroup(stamp, [parsed], t)
  }

  if (action === 'cancel_refund') {
    if (kind === 'remark') {
      return t('invoice.changeLog.cancelRefundRemark', {
        stamp,
        remark: remark || '—',
      })
    }
    if (kind === 'cash') {
      return t('invoice.changeLog.cancelRefundCash', {
        stamp,
        amount: moneyText(amountRaw || '0'),
      })
    }
    if (kind === 'deposit_offset') {
      return t('invoice.changeLog.cancelRefundDepositOffset', {
        stamp,
        amount: moneyText(amountRaw || '0'),
      })
    }
    return t('invoice.changeLog.cancelRefundUnknown', {
      stamp,
      kind,
      detail: amountRaw ? ` · ${moneyText(amountRaw)}` : '',
    })
  }

  if (action === 'vacate_settlement' && kind === 'void_unpaid_deposit') {
    return t('invoice.changeLog.vacateVoidUnpaidDeposit', { stamp })
  }

  return t('invoice.changeLog.unknown', {
    stamp: stamp || '—',
    action: action || '—',
    kind: kind || '—',
    detail: amountRaw ? ` · ${moneyText(amountRaw)}` : '',
  })
}

export function formatInvoiceChangeLogLine(line: string, t: ChangeLogTranslate): string {
  const raw = (line || '').trim()
  if (!raw) return ''
  const parsed = parseInvPipeLine(raw)
  if (parsed) return formatSingleInvLine(parsed, t)
  return formatLegacyContractSyncLine(raw, t) || raw
}

/**
 * 同 stamp 的合約取消多行合并为一条；其余行独立格式化。
 * 输出新→旧（与历史一致）。
 */
export function formatInvoiceChangeLog(
  changeLog: string | null | undefined,
  t: ChangeLogTranslate,
): string {
  const text = (changeLog || '').trim()
  if (!text) return ''

  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  type OutItem = { order: number; stamp: string; text: string }
  const out: OutItem[] = []
  const cancelGroups = new Map<string, { order: number; items: ParsedInvLine[] }>()

  rawLines.forEach((raw, index) => {
    const parsed = parseInvPipeLine(raw)
    if (parsed?.action === 'contract_cancel' && parsed.stamp) {
      const g = cancelGroups.get(parsed.stamp)
      if (g) g.items.push(parsed)
      else cancelGroups.set(parsed.stamp, { order: index, items: [parsed] })
      return
    }
    out.push({
      order: index,
      stamp: parsed?.stamp || '',
      text: formatInvoiceChangeLogLine(raw, t),
    })
  })

  for (const [stamp, g] of cancelGroups) {
    out.push({
      order: g.order,
      stamp,
      text: formatContractCancelGroup(stamp, g.items, t),
    })
  }

  return out
    .filter((x) => Boolean(x.text))
    .sort((a, b) => b.order - a.order)
    .map((x) => x.text)
    .join('\n')
}
