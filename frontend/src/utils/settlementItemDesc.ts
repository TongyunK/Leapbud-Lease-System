/**
 * 終止結算明細 description 展示格式化（庫內可為中文舊文案或 `#csi|…` 機讀碼）。
 *
 * 約定：
 * - #csi|void_receivable_cancel|{invoiceCode}
 * - #csi|booking_deposit_forfeit
 * - #csi|invoice_cash_forfeit
 * - #csi|invoice_deposit_offset_forfeit
 * - #csi|refund_allocation_cancel
 */

export type SettlementDescTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string

export type SettlementItemDescInput = {
  description?: string | null
  remark?: string | null
  itemType?: string | null
}

export type SettlementItemDescParts = {
  /** 不含末尾業務編號的說明 */
  text: string
  /** 可點開的發票／應收編號（若有） */
  code: string
}

const REMARK_KEYS: Record<string, string> = {
  booking_deposit_forfeit: 'contractSettlement.itemDesc.bookingDepositForfeit',
  invoice_cash_forfeit: 'contractSettlement.itemDesc.invoiceCashForfeit',
  invoice_deposit_offset_forfeit: 'contractSettlement.itemDesc.invoiceDepositOffsetForfeit',
  void_receivable_cancel: 'contractSettlement.itemDesc.voidReceivableCancel',
  refund_allocation_cancel: 'contractSettlement.itemDesc.refundAllocationCancel',
}

/** 歷史簡／繁固定描述 → i18n key（無尾碼） */
const LEGACY_EXACT: Array<{ re: RegExp; key: string }> = [
  {
    re: /^取消合[约約]扣留定金[余餘][额額]$/,
    key: 'contractSettlement.itemDesc.bookingDepositForfeit',
  },
  {
    re: /^取消合[约約]扣留[发發]票另收$/,
    key: 'contractSettlement.itemDesc.invoiceCashForfeit',
  },
  {
    re: /^取消合[约約]扣留[发發]票定金抵扣$/,
    key: 'contractSettlement.itemDesc.invoiceDepositOffsetForfeit',
  },
  {
    re: /^取消合[约約][应應]退[／/]待退[额額]度[（(]定金[余餘][额額][＋+][发發]票另收等[）)]$/,
    key: 'contractSettlement.itemDesc.refundAllocationCancel',
  },
]

/** 取消合約作廢應收（簡：取消合约作废应收） */
const VOID_RECEIVABLE_PREFIX_RE = /^取消合[约約]作[废廢][应應]收\s*/

const VOID_RECEIVABLE_RE =
  /^(?:#csi\|void_receivable_cancel\||取消合[约約]作[废廢][应應]收\s+)(.+)$/

const CSI_PREFIX = /^#csi\|([a-z0-9_]+)(?:\|(.*))?$/i

function extractTrailingCode(raw: string): { text: string; code: string } {
  const m = raw.match(/^(.*?)(\s+)([A-Za-z0-9][A-Za-z0-9._-]{2,})$/)
  if (!m) return { text: raw, code: '' }
  return { text: (m[1] || '').trim() || raw, code: m[3] || '' }
}

/**
 * 將明細描述拆成可 i18n 的正文 + 可點業務編號。
 */
export function formatSettlementItemDescParts(
  row: SettlementItemDescInput,
  t: SettlementDescTranslate,
): SettlementItemDescParts {
  const remark = (row.remark || '').trim()
  const raw = (row.description || '').trim()

  if (!raw && !remark) return { text: '—', code: '' }

  // 1) remark 機讀碼（取消沒收／應退等）
  const remarkKey = REMARK_KEYS[remark]
  if (remarkKey) {
    if (remark === 'void_receivable_cancel') {
      const fromCsi = raw.match(/^#csi\|void_receivable_cancel\|(.+)$/i)
      const stripped = raw.replace(VOID_RECEIVABLE_PREFIX_RE, '').trim()
      const code =
        (fromCsi?.[1] || '').trim() ||
        (stripped && stripped !== raw ? stripped : '') ||
        extractTrailingCode(raw).code
      return { text: t(remarkKey), code }
    }
    return { text: t(remarkKey), code: '' }
  }

  // 2) #csi|… 機讀描述
  const csi = raw.match(CSI_PREFIX)
  if (csi) {
    const kind = (csi[1] || '').toLowerCase()
    const rest = (csi[2] || '').trim()
    const key = REMARK_KEYS[kind]
    if (key) {
      if (kind === 'void_receivable_cancel') {
        return { text: t(key), code: rest }
      }
      return { text: t(key), code: '' }
    }
  }

  // 3) 作廢應收（歷史簡／繁中文／機讀）
  const voidM = raw.match(VOID_RECEIVABLE_RE)
  if (voidM) {
    return {
      text: t('contractSettlement.itemDesc.voidReceivableCancel'),
      code: (voidM[1] || '').trim(),
    }
  }
  if ((row.itemType || '').trim() === 'VOID_RECEIVABLE') {
    const split = extractTrailingCode(raw)
    if (VOID_RECEIVABLE_PREFIX_RE.test(split.text) || VOID_RECEIVABLE_PREFIX_RE.test(raw)) {
      const code =
        split.code ||
        raw.replace(VOID_RECEIVABLE_PREFIX_RE, '').trim() ||
        ''
      return {
        text: t('contractSettlement.itemDesc.voidReceivableCancel'),
        code: code === raw ? '' : code,
      }
    }
  }

  // 4) 其它歷史固定中文
  for (const { re, key } of LEGACY_EXACT) {
    if (re.test(raw)) return { text: t(key), code: '' }
  }

  // 5) 原樣 + 尾碼拆分（供點開發票／應收）
  return extractTrailingCode(raw || '—')
}

export function formatSettlementItemDesc(
  row: SettlementItemDescInput,
  t: SettlementDescTranslate,
): string {
  const { text, code } = formatSettlementItemDescParts(row, t)
  return code ? `${text} ${code}` : text
}
