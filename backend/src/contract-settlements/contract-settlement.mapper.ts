import type {
  Contract,
  ContractSettlement,
  ContractSettlementItem,
  Customer,
  Room,
} from '@prisma/client'
import { Prisma } from '@prisma/client'
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit'

function dateOnly(d: Date | null | undefined): string {
  if (!d) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  return Number(value.toString())
}

export type SettlementItemRow = ContractSettlementItem

export type ContractSettlementWithRelations = ContractSettlement & {
  contract?: Pick<Contract, 'id' | 'contractCode'> | null
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null
  room?: Pick<Room, 'id' | 'roomCode' | 'name'> | null
  items?: SettlementItemRow[]
  _count?: {
    items?: number
    writeoffs?: number
    refundOrders?: number
  }
  createdByUser?: AuditUserRef | null
  updatedByUser?: AuditUserRef | null
}

export const settlementInclude = {
  contract: { select: { id: true, contractCode: true } },
  customer: { select: { id: true, customerCode: true, name: true } },
  room: { select: { id: true, roomCode: true, name: true } },
  items: { orderBy: { sortOrder: 'asc' as const } },
  _count: { select: { items: true, writeoffs: true, refundOrders: true } },
  ...auditUserInclude,
} satisfies Prisma.ContractSettlementInclude

export function toContractSettlementDto(row: ContractSettlementWithRelations) {
  return {
    id: row.id,
    settlementCode: row.settlementCode,
    type: row.type,
    refundStatus: row.refundStatus,
    /** @deprecated 兼容旧前端：等同 refundStatus */
    status: row.refundStatus,
    collectStatus: row.collectStatus,
    contractId: row.contractId,
    contractCode: row.contract?.contractCode ?? '',
    customerId: row.customerId,
    customerCode: row.customer?.customerCode ?? '',
    customerName: row.customer?.name ?? '',
    roomId: row.roomId,
    roomCode: row.room?.roomCode ?? '',
    roomName: row.room?.name ?? '',
    settlementDate: dateOnly(row.settlementDate),
    terminationDate: dateOnly(row.terminationDate),
    depositTotal: decimalToNumber(row.depositTotal),
    deductionTotal: decimalToNumber(row.deductionTotal),
    waiverTotal: decimalToNumber(row.waiverTotal),
    additionalTotal: decimalToNumber(row.additionalTotal),
    refundDueTotal: decimalToNumber(row.refundDueTotal),
    refundedTotal: decimalToNumber(row.refundedTotal),
    refundRemaining: Math.max(
      0,
      Math.round(
        (decimalToNumber(row.refundDueTotal) - decimalToNumber(row.refundedTotal)) * 100,
      ) / 100,
    ),
    collectDueTotal: decimalToNumber(row.collectDueTotal),
    collectedTotal: decimalToNumber(row.collectedTotal),
    collectRemaining: Math.max(
      0,
      Math.round(
        (decimalToNumber(row.collectDueTotal) - decimalToNumber(row.collectedTotal)) * 100,
      ) / 100,
    ),
    depositRefundId: row.depositRefundId,
    terminationKind: row.terminationKind || '',
    reason: row.reason ?? '',
    noticeAttachment: row.noticeAttachment ?? '',
    doorKeyReturnedQty: row.doorKeyReturnedQty ?? 0,
    smartCardReturnedQty: row.smartCardReturnedQty ?? 0,
    siteCondition: row.siteCondition ?? '',
    legacyTerminationCode: row.legacyTerminationCode ?? '',
    remark: row.remark ?? '',
    itemCount: row._count?.items ?? row.items?.length ?? 0,
    writeoffCount: row._count?.writeoffs ?? 0,
    refundOrderCount: row._count?.refundOrders ?? 0,
    items: (row.items || []).map((it) => ({
      id: it.id,
      itemType: it.itemType,
      description: it.description,
      amount: decimalToNumber(it.amount),
      quantity: decimalToNumber(it.quantity),
      unitAmount: decimalToNumber(it.unitAmount),
      returnStatus: it.returnStatus || '',
      sourceLoanItemId: it.sourceLoanItemId,
      receivableId: it.receivableId,
      invoiceId: it.invoiceId,
      sortOrder: it.sortOrder,
      remark: it.remark ?? '',
    })),
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
