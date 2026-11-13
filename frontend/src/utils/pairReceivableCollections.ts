/** 定金抵扣与另收按同应收、同日期顺序配对，便于同行展示 */

export type DepositApplySide = {
  id: string
  amount: number
  movementDate: string
  bookingDepositReceiptId: string
  bookingDepositReceiptCode: string
  receivableId?: string | null
  invoiceId?: string | null
  invoiceCode?: string | null
}

export type CashReceiptSide = {
  id: string
  receiptCode: string
  paymentDate: string
  paymentMethod: string
  amount: number | null
  receivableId?: string | null
  invoiceCode?: string | null
}

/** 将收据按分摊展开为配对用的现金侧（无分摊则回退头表 receivableId） */
export function expandCashReceiptsForPairing(
  receipts: Array<{
    id: string
    receiptCode: string
    paymentDate: string
    paymentMethod: string
    amount: number | null
    receivableId?: string | null
    invoiceCode?: string | null
    allocations?: Array<{
      receivableId: string
      amount: number | null
      invoiceCode?: string | null
    }>
  }>,
): CashReceiptSide[] {
  const out: CashReceiptSide[] = []
  for (const r of receipts) {
    const allocs = r.allocations?.filter((a) => (a.receivableId || '').trim()) ?? []
    if (allocs.length) {
      for (const a of allocs) {
        out.push({
          id: r.id,
          receiptCode: r.receiptCode,
          paymentDate: r.paymentDate,
          paymentMethod: r.paymentMethod,
          amount: a.amount,
          receivableId: a.receivableId,
          invoiceCode: a.invoiceCode || r.invoiceCode || null,
        })
      }
      continue
    }
    out.push({
      id: r.id,
      receiptCode: r.receiptCode,
      paymentDate: r.paymentDate,
      paymentMethod: r.paymentMethod,
      amount: r.amount,
      receivableId: r.receivableId,
      invoiceCode: r.invoiceCode || null,
    })
  }
  return out
}

export type PairedCollectionRow = {
  key: string
  apply: DepositApplySide | null
  cash: CashReceiptSide | null
}

function sortApplies(rows: DepositApplySide[]) {
  return [...rows].sort(
    (a, b) =>
      (a.movementDate || '').localeCompare(b.movementDate || '') || a.id.localeCompare(b.id),
  )
}

function sortCash(rows: CashReceiptSide[]) {
  return [...rows].sort(
    (a, b) =>
      (a.paymentDate || '').localeCompare(b.paymentDate || '') || a.id.localeCompare(b.id),
  )
}

function zipGroup(applies: DepositApplySide[], cash: CashReceiptSide[]): PairedCollectionRow[] {
  const a = sortApplies(applies)
  const c = sortCash(cash)
  const n = Math.max(a.length, c.length)
  const out: PairedCollectionRow[] = []
  for (let i = 0; i < n; i++) {
    const apply = a[i] ?? null
    const cashRow = c[i] ?? null
    out.push({
      key: apply?.id || cashRow?.id || `pair-${i}`,
      apply,
      cash: cashRow,
    })
  }
  return out
}

/**
 * 同次收款通常一笔抵扣配一笔另收。
 * 优先按 receivableId 分组后再 zip，避免多应收混在一起错配。
 */
export function pairDepositAppliesWithCash(
  applies: DepositApplySide[],
  cash: CashReceiptSide[],
): PairedCollectionRow[] {
  if (!applies.length && !cash.length) return []

  const applyByRecv = new Map<string, DepositApplySide[]>()
  const cashByRecv = new Map<string, CashReceiptSide[]>()
  const orphanApplies: DepositApplySide[] = []
  const orphanCash: CashReceiptSide[] = []

  for (const ap of applies) {
    const rid = (ap.receivableId || '').trim()
    if (!rid) {
      orphanApplies.push(ap)
      continue
    }
    const list = applyByRecv.get(rid) || []
    list.push(ap)
    applyByRecv.set(rid, list)
  }
  for (const r of cash) {
    const rid = (r.receivableId || '').trim()
    if (!rid) {
      orphanCash.push(r)
      continue
    }
    const list = cashByRecv.get(rid) || []
    list.push(r)
    cashByRecv.set(rid, list)
  }

  const recvIds = new Set([...applyByRecv.keys(), ...cashByRecv.keys()])
  const out: PairedCollectionRow[] = []
  for (const rid of [...recvIds].sort()) {
    out.push(...zipGroup(applyByRecv.get(rid) || [], cashByRecv.get(rid) || []))
  }
  if (orphanApplies.length || orphanCash.length) {
    out.push(...zipGroup(orphanApplies, orphanCash))
  }
  return out
}
