import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

function leadingCode(description?: string | null): string {
  const raw = (description || '').trim()
  if (!raw || raw === '需退') return ''
  const noDue = raw.replace(/\s*需退\s*$/u, '').trim()
  return (noDue.split(/\s+/)[0] || '').trim()
}

/** 发票关联：收据入账 ∪ 退款单出账（明细挂应收／收据／描述发票号） */
export function cashFlowWhereForInvoice(invoiceId: string): Prisma.CashFlowWhereInput {
  const id = (invoiceId || '').trim()
  if (!id) return { id: '__none__' }
  return {
    OR: [
      { receipt: { invoiceId: id } },
      { receipt: { allocations: { some: { invoiceId: id } } } },
      {
        refundOrder: {
          items: {
            some: {
              OR: [
                { receivable: { invoiceId: id } },
                { receipt: { invoiceId: id } },
                { receipt: { allocations: { some: { invoiceId: id } } } },
              ],
            },
          },
        },
      },
    ],
  }
}

/** 应收关联：收据入账 ∪ 退款单出账（明细挂应收／收据） */
export function cashFlowWhereForReceivable(
  receivableId: string,
): Prisma.CashFlowWhereInput {
  const id = (receivableId || '').trim()
  if (!id) return { id: '__none__' }
  return {
    OR: [
      { receipt: { receivableId: id } },
      { receipt: { allocations: { some: { receivableId: id } } } },
      {
        refundOrder: {
          items: {
            some: {
              OR: [
                { receivableId: id },
                { receipt: { receivableId: id } },
                { receipt: { allocations: { some: { receivableId: id } } } },
              ],
            },
          },
        },
      },
    ],
  }
}

function bump(map: Map<string, Set<string>>, entityId: string, flowId: string) {
  const set = map.get(entityId)
  if (!set) return
  set.add(flowId)
}

function toCounts(flowIds: Map<string, Set<string>>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const [id, set] of flowIds) counts.set(id, set.size)
  return counts
}

/** 按发票 ID 批量统计关联资金流水（入账＋出账，按流水 id 去重） */
export async function cashFlowCountsForInvoices(
  prisma: Db,
  invoiceIds: string[],
): Promise<Map<string, number>> {
  const flowIds = new Map<string, Set<string>>()
  for (const id of invoiceIds) flowIds.set(id, new Set())
  if (!invoiceIds.length) return toCounts(flowIds)

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds } },
    select: { id: true, invoiceCode: true, contractId: true },
  })
  const codeToId = new Map<string, string>()
  const contractIds = new Set<string>()
  for (const inv of invoices) {
    const code = (inv.invoiceCode || '').trim()
    if (code) codeToId.set(code, inv.id)
    if (inv.contractId) contractIds.add(inv.contractId)
  }

  const inFlows = await prisma.cashFlow.findMany({
    where: {
      receiptId: { not: null },
      OR: [
        { receipt: { invoiceId: { in: invoiceIds } } },
        { receipt: { allocations: { some: { invoiceId: { in: invoiceIds } } } } },
      ],
    },
    select: {
      id: true,
      receipt: {
        select: {
          invoiceId: true,
          allocations: { select: { invoiceId: true } },
        },
      },
    },
  })
  for (const flow of inFlows) {
    if (flow.receipt?.invoiceId) bump(flowIds, flow.receipt.invoiceId, flow.id)
    for (const a of flow.receipt?.allocations ?? []) {
      if (a.invoiceId) bump(flowIds, a.invoiceId, flow.id)
    }
  }

  const outFlows = await prisma.cashFlow.findMany({
    where: {
      refundOrderId: { not: null },
      OR: [
        {
          refundOrder: {
            items: {
              some: {
                OR: [
                  { receivable: { invoiceId: { in: invoiceIds } } },
                  { receipt: { invoiceId: { in: invoiceIds } } },
                  {
                    receipt: {
                      allocations: { some: { invoiceId: { in: invoiceIds } } },
                    },
                  },
                ],
              },
            },
          },
        },
        // 取消稍后需退明细常无 receivableId：同合约退款单按描述发票号兜底
        ...(contractIds.size
          ? [
              {
                refundOrder: {
                  contractId: { in: [...contractIds] },
                  items: { some: {} },
                },
              } as Prisma.CashFlowWhereInput,
            ]
          : []),
      ],
    },
    select: {
      id: true,
      refundOrder: {
        select: {
          contractId: true,
          items: {
            select: {
              description: true,
              receivable: { select: { invoiceId: true } },
              receipt: {
                select: {
                  invoiceId: true,
                  allocations: { select: { invoiceId: true } },
                },
              },
            },
          },
        },
      },
    },
  })
  for (const flow of outFlows) {
    const targets = new Set<string>()
    for (const it of flow.refundOrder?.items ?? []) {
      if (it.receivable?.invoiceId) targets.add(it.receivable.invoiceId)
      if (it.receipt?.invoiceId) targets.add(it.receipt.invoiceId)
      for (const a of it.receipt?.allocations ?? []) {
        if (a.invoiceId) targets.add(a.invoiceId)
      }
      const code = leadingCode(it.description)
      const byCode = code ? codeToId.get(code) : undefined
      if (byCode) targets.add(byCode)
    }
    for (const id of targets) bump(flowIds, id, flow.id)
  }

  return toCounts(flowIds)
}

/** 按应收 ID 批量统计关联资金流水（入账＋出账，按流水 id 去重） */
export async function cashFlowCountsForReceivables(
  prisma: Db,
  receivableIds: string[],
): Promise<Map<string, number>> {
  const flowIds = new Map<string, Set<string>>()
  for (const id of receivableIds) flowIds.set(id, new Set())
  if (!receivableIds.length) return toCounts(flowIds)

  const receivables = await prisma.receivable.findMany({
    where: { id: { in: receivableIds } },
    select: {
      id: true,
      contractId: true,
      invoice: { select: { id: true, invoiceCode: true } },
    },
  })
  /** 发票号 → 本批应收 id（一张发票多应收时都挂上） */
  const codeToRecvIds = new Map<string, string[]>()
  const contractIds = new Set<string>()
  for (const r of receivables) {
    if (r.contractId) contractIds.add(r.contractId)
    const code = (r.invoice?.invoiceCode || '').trim()
    if (!code) continue
    const list = codeToRecvIds.get(code) || []
    list.push(r.id)
    codeToRecvIds.set(code, list)
  }

  const inFlows = await prisma.cashFlow.findMany({
    where: {
      receiptId: { not: null },
      OR: [
        { receipt: { receivableId: { in: receivableIds } } },
        {
          receipt: {
            allocations: { some: { receivableId: { in: receivableIds } } },
          },
        },
      ],
    },
    select: {
      id: true,
      receipt: {
        select: {
          receivableId: true,
          allocations: { select: { receivableId: true } },
        },
      },
    },
  })
  for (const flow of inFlows) {
    if (flow.receipt?.receivableId) {
      bump(flowIds, flow.receipt.receivableId, flow.id)
    }
    for (const a of flow.receipt?.allocations ?? []) {
      if (a.receivableId) bump(flowIds, a.receivableId, flow.id)
    }
  }

  const outFlows = await prisma.cashFlow.findMany({
    where: {
      refundOrderId: { not: null },
      OR: [
        {
          refundOrder: {
            items: {
              some: {
                OR: [
                  { receivableId: { in: receivableIds } },
                  { receipt: { receivableId: { in: receivableIds } } },
                  {
                    receipt: {
                      allocations: {
                        some: { receivableId: { in: receivableIds } },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        ...(contractIds.size
          ? [
              {
                refundOrder: {
                  contractId: { in: [...contractIds] },
                  items: { some: {} },
                },
              } as Prisma.CashFlowWhereInput,
            ]
          : []),
      ],
    },
    select: {
      id: true,
      refundOrder: {
        select: {
          items: {
            select: {
              description: true,
              receivableId: true,
              receipt: {
                select: {
                  receivableId: true,
                  allocations: { select: { receivableId: true } },
                },
              },
            },
          },
        },
      },
    },
  })
  for (const flow of outFlows) {
    const targets = new Set<string>()
    for (const it of flow.refundOrder?.items ?? []) {
      if (it.receivableId) targets.add(it.receivableId)
      if (it.receipt?.receivableId) targets.add(it.receipt.receivableId)
      for (const a of it.receipt?.allocations ?? []) {
        if (a.receivableId) targets.add(a.receivableId)
      }
      const code = leadingCode(it.description)
      for (const rid of codeToRecvIds.get(code) || []) targets.add(rid)
    }
    for (const id of targets) bump(flowIds, id, flow.id)
  }

  return toCounts(flowIds)
}
