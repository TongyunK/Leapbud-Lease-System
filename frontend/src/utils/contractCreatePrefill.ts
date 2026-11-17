/**
 * 从客户需求等入口跳转「新增合约」时的预填草稿（sessionStorage，消费即删）。
 */
export type ContractCreatePrefill = {
  customerId?: string
  customerCode?: string
  customerName?: string
  buildingId?: string
  roomId?: string
  roomCode?: string
  roomName?: string
  buildingName?: string
  monthlyRent?: number | null
  requirementId?: string
  requirementCode?: string
  salesManagerId?: string
  /** 需求侧租赁时长（用于首段合约期） */
  leaseDurationAmount?: number | null
  leaseDurationUnit?: 'year' | 'month' | 'day' | 'hour'
  remark?: string
}

const STORAGE_KEY = 'lb.contractCreatePrefill'

export function setContractCreatePrefill(payload: ContractCreatePrefill) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore quota / private mode */
  }
}

export function consumeContractCreatePrefill(): ContractCreatePrefill | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    sessionStorage.removeItem(STORAGE_KEY)
    const parsed = JSON.parse(raw) as ContractCreatePrefill
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    return null
  }
}

/** 需求租赁单位 → 合约期单位／数值 */
export function prefillToPeriodUnitValue(
  amount: number | null | undefined,
  unit: ContractCreatePrefill['leaseDurationUnit'],
): { dateUnit: '月' | '日'; dateValue: number } | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null
  const n = Math.round(amount)
  if (unit === 'day') return { dateUnit: '日', dateValue: n }
  if (unit === 'hour') return { dateUnit: '日', dateValue: Math.max(1, Math.ceil(n / 24)) }
  if (unit === 'year') return { dateUnit: '月', dateValue: n * 12 }
  return { dateUnit: '月', dateValue: n }
}
