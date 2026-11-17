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
            select: {
              receivedAmount: true,
              refundedAmount: true,
              receivableAmount: true,
              invoiceAmount: true,
            },
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
    const inv = round2(
      Number(it.receivable.invoiceAmount?.toString?.() ?? it.amount.toString()) || 0,
    )
    const openStored = round2(
      Number(it.receivable.receivableAmount?.toString?.() ?? 0) || 0,
    )
    const received = round2(Number(it.receivable.receivedAmount.toString()) || 0)
    const refunded = round2(
      Number(it.receivable.refundedAmount?.toString?.() ?? 0) || 0,
    )
    const openDerived = round2(Math.max(0, inv - received + refunded))
    // 未收以推算与库值较大者为准，避免误把部分收款当成已结清
    const open = round2(Math.max(openStored, openDerived))
    const collected = round2(Math.max(0, Math.min(inv, inv - open)))
    collectedTotal = round2(collectedTotal + collected)
    linkedDue = round2(linkedDue + inv)
  }

  let collectDue = round2(Number(row.collectDueTotal.toString()))
  const patchDue =
    collectDue <= 0.009 && linkedDue > 0.009
  if (patchDue) collectDue = linkedDue

  // 无应补金额时亦视为已结清（不再使用 none）
  let collectStatus: ContractSettlementCollectStatus =
    ContractSettlementCollectStatus.settled
  if (collectDue > 0.009) {
    const remaining = round2(Math.max(0, collectDue - collectedTotal))
    if (collectedTotal <= 0.009) {
      collectStatus = ContractSettlementCollectStatus.pending_collect
    } else if (remaining > 0.009) {
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
