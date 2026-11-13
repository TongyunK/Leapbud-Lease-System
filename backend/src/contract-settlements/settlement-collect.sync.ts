import {
  ContractSettlementCollectStatus,
  ContractSettlementItemType,
  Prisma,
  type PrismaClient,
} from '@prisma/client'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function dec(n: number) {
  return new Prisma.Decimal(round2(n))
}

type DbClient = Prisma.TransactionClient | PrismaClient

/**
 * 按 ADDITIONAL_CHARGE 关联应收回写结算已收与应收状态。
 */
export async function recalcSettlementCollectTotals(
  db: DbClient,
  settlementId: string,
  actorId?: string | null,
) {
  const id = (settlementId || '').trim()
  if (!id) return null

  const row = await db.contractSettlement.findUnique({
    where: { id },
    select: {
      id: true,
      collectDueTotal: true,
      items: {
        where: {
          itemType: ContractSettlementItemType.ADDITIONAL_CHARGE,
          receivableId: { not: null },
        },
        select: {
          amount: true,
          receivableId: true,
          receivable: {
            select: { receivedAmount: true, invoiceAmount: true },
          },
        },
      },
    },
  })
  if (!row) return null

  let collectedTotal = 0
  let linkedDue = 0
  for (const it of row.items || []) {
    if (!it.receivable) continue
    collectedTotal = round2(
      collectedTotal + Number(it.receivable.receivedAmount.toString()),
    )
    linkedDue = round2(
      linkedDue +
        Number(it.receivable.invoiceAmount?.toString?.() ?? it.amount.toString()),
    )
  }

  let collectDue = round2(Number(row.collectDueTotal.toString()))
  const patchDue =
    collectDue <= 0.009 && linkedDue > 0.009
  if (patchDue) collectDue = linkedDue

  let collectStatus: ContractSettlementCollectStatus =
    ContractSettlementCollectStatus.none
  if (collectDue > 0.009) {
    if (collectedTotal <= 0.009) {
      collectStatus = ContractSettlementCollectStatus.pending_collect
    } else if (collectedTotal + 0.009 < collectDue) {
      collectStatus = ContractSettlementCollectStatus.partial
    } else {
      collectStatus = ContractSettlementCollectStatus.settled
    }
  }

  const updated = await db.contractSettlement.update({
    where: { id },
    data: {
      ...(patchDue ? { collectDueTotal: dec(collectDue) } : {}),
      collectedTotal: dec(collectedTotal),
      collectStatus,
      updatedById: actorId || null,
    },
  })

  return {
    settlementId: updated.id,
    collectStatus: updated.collectStatus,
    collectDueTotal: round2(Number(updated.collectDueTotal.toString())),
    collectedTotal,
    collectRemaining: round2(Math.max(0, collectDue - collectedTotal)),
  }
}

/** 应收若挂在结算 ADDITIONAL_CHARGE，则回写该结算应收进度 */
export async function recalcSettlementCollectForReceivable(
  db: DbClient,
  receivableId: string,
  actorId?: string | null,
) {
  const id = (receivableId || '').trim()
  if (!id) return null
  const item = await db.contractSettlementItem.findFirst({
    where: {
      receivableId: id,
      itemType: ContractSettlementItemType.ADDITIONAL_CHARGE,
    },
    select: { settlementId: true },
  })
  if (!item?.settlementId) return null
  return recalcSettlementCollectTotals(db, item.settlementId, actorId)
}
