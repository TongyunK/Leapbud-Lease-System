import type {
  Contract,
  Customer,
  DepositRefund,
  DepositRefundAttachment,
  Room,
  User,
} from '@prisma/client'
import { Prisma } from '@prisma/client'
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit'

function iso(d: Date) {
  return d.toISOString()
}

function dateOnly(d: Date | null | undefined): string {
  if (!d) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null
  if (typeof value === 'number') return value
  return Number(value.toString())
}

type HandlerLite = Pick<User, 'id' | 'account' | 'displayName'>

export type DepositRefundAttachmentRow = Pick<
  DepositRefundAttachment,
  'id' | 'depositRefundId' | 'fileName' | 'storageKey' | 'sortOrder'
>

export function isExternalDepositRefundAttachmentKey(storageKey: string): boolean {
  return /^https?:\/\//i.test((storageKey || '').trim())
}

export function depositRefundAttachmentStorageRel(storageKey: string): string {
  return (storageKey || '').trim().replace(/^\/+/, '')
}

export function depositRefundAttachmentPublicUrl(storageKey: string): string | undefined {
  const key = (storageKey || '').trim()
  if (!key) return undefined
  if (/^https?:\/\//i.test(key)) return key
  const rel = depositRefundAttachmentStorageRel(key)
  if (!rel || rel.includes('..')) return undefined
  return `/files/${rel}`
}

export function toDepositRefundAttachmentDto(row: DepositRefundAttachmentRow) {
  const storageKey = row.storageKey ?? ''
  return {
    id: row.id,
    depositRefundId: row.depositRefundId,
    fileName: row.fileName,
    sortOrder: row.sortOrder,
    publicUrl: depositRefundAttachmentPublicUrl(storageKey),
  }
}

export type DepositRefundWithRelations = DepositRefund & {
  _count?: { receivables: number }
  contract?: Pick<Contract, 'id' | 'contractCode'> | null
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null
  room?: Pick<Room, 'id' | 'roomCode' | 'name'> | null
  handlerUser?: HandlerLite | null
  attachments?: DepositRefundAttachmentRow[]
  createdByUser?: AuditUserRef | null
  updatedByUser?: AuditUserRef | null
}

export const depositRefundInclude = {
  _count: { select: { receivables: true } },
  contract: { select: { id: true, contractCode: true } },
  customer: { select: { id: true, customerCode: true, name: true } },
  room: { select: { id: true, roomCode: true, name: true } },
  handlerUser: { select: { id: true, account: true, displayName: true } },
  attachments: { orderBy: { sortOrder: 'asc' as const } },
  ...auditUserInclude,
} as const

function handlerLabel(u?: HandlerLite | null) {
  if (!u) return ''
  return (u.displayName || '').trim() || u.account
}

export function toDepositRefundDto(row: DepositRefundWithRelations) {
  return {
    id: row.id,
    refundCode: row.refundCode,
    contractId: row.contractId,
    contractCode: row.contract?.contractCode ?? '',
    customerId: row.customerId,
    customerCode: row.customer?.customerCode ?? '',
    customerName: row.customer?.name ?? '',
    roomId: row.roomId,
    roomCode: row.room?.roomCode ?? '',
    roomName: row.room?.name ?? '',
    status: row.status,
    terminationDate: dateOnly(row.terminationDate),
    refundDate: dateOnly(row.refundDate),
    totalDeposit: decimalToNumber(row.totalDeposit),
    refundDueAmount: decimalToNumber(row.refundDueAmount) ?? 0,
    actualRefundAmount: decimalToNumber(row.actualRefundAmount),
    bookingDepositRefundAmount: decimalToNumber(row.bookingDepositRefundAmount) ?? 0,
    handlerId: row.handlerId,
    handler: handlerLabel(row.handlerUser),
    voucherImage: row.voucherImage,
    voucherAttachment: row.voucherAttachment,
    attachments: (row.attachments ?? []).map(toDepositRefundAttachmentDto),
    remark: row.remark,
    receivableCount: row._count?.receivables ?? 0,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
