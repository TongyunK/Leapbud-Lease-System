export type StatusTone =
  | 'idle'
  | 'signing'
  | 'contracting'
  | 'leased'
  | 'leasing'
  | 'terminating'
  | 'active'
  | 'disabled'
  | 'neutral'

const ROOM_STATUS_TONES = {
  idle: 'idle',
  signing: 'signing',
  leased: 'leased',
  terminating: 'terminating',
} as const

const USER_STATUS_TONES = {
  active: 'active',
  disabled: 'disabled',
} as const

export function roomStatusTone(status: string | null | undefined): StatusTone {
  const key = (status || '') as keyof typeof ROOM_STATUS_TONES
  return ROOM_STATUS_TONES[key] || 'neutral'
}

/** 房间状态列：占用填充态色 */
const ROOM_FILL_STATUS_TONES = {
  idle: 'idle',
  whole: 'leased',
  partial: 'leasing',
  full: 'contracting',
} as const

export function roomFillStatusTone(summary: string | null | undefined): StatusTone {
  const key = (summary || 'idle') as keyof typeof ROOM_FILL_STATUS_TONES
  return ROOM_FILL_STATUS_TONES[key] || 'neutral'
}

/** 房间租赁能力色：可整可分 / 只能整租 / 只能分租 */
const ROOM_LEASE_CAPABILITY_TONES = {
  flexible: 'leasing',
  whole_only: 'leased',
  part_only: 'signing',
} as const

export function roomLeaseCapabilityTone(cap: string | null | undefined): StatusTone {
  const key = (cap || 'flexible') as keyof typeof ROOM_LEASE_CAPABILITY_TONES
  return ROOM_LEASE_CAPABILITY_TONES[key] || 'neutral'
}

/** 收据分类色：定金收据 / 发票收据 */
const RECEIPT_KIND_TONES = {
  booking_deposit: 'signing',
  invoice: 'leased',
} as const

export function receiptKindTone(kind: string | null | undefined): StatusTone {
  const key = (kind || 'invoice') as keyof typeof RECEIPT_KIND_TONES
  return RECEIPT_KIND_TONES[key] || 'neutral'
}

export function userStatusTone(status: string | null | undefined): StatusTone {
  const key = (status || '') as keyof typeof USER_STATUS_TONES
  return USER_STATUS_TONES[key] || 'neutral'
}

/** 客户状态色：绿 / 橙 / 深蓝 / 浅蓝 / 红 / 红 */
const CUSTOMER_STATUS_TONES: Record<string, StatusTone> = {
  新客戶: 'idle',
  已查詢: 'signing',
  簽約中: 'contracting',
  租賃中: 'leasing',
  退租中: 'terminating',
  已退租: 'terminating',
}

export function customerStatusTone(status: string | null | undefined): StatusTone {
  const key = (status || '').trim()
  return CUSTOMER_STATUS_TONES[key] || 'neutral'
}

/** 客户需求状态色：蓝 / 绿 / 红 */
const CUSTOMER_REQUIREMENT_STATUS_TONES: Record<string, StatusTone> = {
  跟進中: 'contracting',
  已簽約: 'idle',
  已取消: 'terminating',
}

export function customerRequirementStatusTone(status: string | null | undefined): StatusTone {
  const key = (status || '').trim()
  return CUSTOMER_REQUIREMENT_STATUS_TONES[key] || 'neutral'
}

/** 需求类型色：长租绿 / 短租橙 */
const CUSTOMER_REQUIREMENT_RENTAL_TYPE_TONES: Record<string, StatusTone> = {
  long: 'idle',
  short: 'signing',
}

export function customerRequirementRentalTypeTone(
  rentalType: string | null | undefined,
): StatusTone {
  const key = (rentalType || '').trim()
  return CUSTOMER_REQUIREMENT_RENTAL_TYPE_TONES[key] || 'neutral'
}

/** 合约状态色 */
const CONTRACT_STATUS_TONES: Record<string, StatusTone> = {
  草稿: 'neutral',
  簽約中: 'signing',
  已簽約: 'contracting',
  交吉中: 'signing',
  租賃中: 'leased',
  已完成: 'idle',
  退租中: 'terminating',
  已退租: 'terminating',
  已取消: 'neutral',
  已續約: 'leasing',
}

export function contractStatusTone(status: string | null | undefined): StatusTone {
  const key = (status || '').trim()
  return CONTRACT_STATUS_TONES[key] || 'neutral'
}

/** 合约租赁方式色：整租绿 / 分租蓝 */
export function contractOccupancyTone(occupancyMode: string | null | undefined): StatusTone {
  return String(occupancyMode || '')
    .trim()
    .toLowerCase() === 'part'
    ? 'leasing'
    : 'leased'
}

/** 按金退还状态色：草稿灰 / 未退按金橙 / 已退按金绿 / 已取消红 */
const DEPOSIT_REFUND_STATUS_TONES: Record<string, StatusTone> = {
  草稿: 'neutral',
  未退按金: 'signing',
  已退按金: 'idle',
  已取消: 'terminating',
}

export function depositRefundStatusTone(status: string | null | undefined): StatusTone {
  const key = (status || '').trim()
  return DEPOSIT_REFUND_STATUS_TONES[key] || 'neutral'
}

/** 发票状态色：待开票橙 / 已开票绿 / 已取消红 */
const INVOICE_STATUS_TONES: Record<string, StatusTone> = {
  待開票: 'signing',
  已開票: 'idle',
  已取消: 'terminating',
}

export function invoiceStatusTone(status: string | null | undefined): StatusTone {
  const key = (status || '').trim()
  return INVOICE_STATUS_TONES[key] || 'neutral'
}
