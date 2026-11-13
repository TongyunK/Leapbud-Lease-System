import { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

function dayPrefix(prefix: string, now = new Date()) {
  const y = String(now.getFullYear()).slice(-2)
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${prefix}${y}${m}${day}`
}

async function nextDailyCode(
  tx: Tx | undefined,
  prefix: string,
  findLatest: (p: string) => Promise<string | null>,
) {
  const p = dayPrefix(prefix)
  const latest = await findLatest(p)
  let seq = 1
  if (latest) {
    const n = Number(latest.slice(p.length))
    if (!Number.isNaN(n)) seq = n + 1
  }
  return `${p}${String(seq).padStart(4, '0')}`
}

export async function nextSettlementCode(db: Tx | { contractSettlement: any }) {
  return nextDailyCode(undefined, 'CST', async (p) => {
    const row = await db.contractSettlement.findFirst({
      where: { settlementCode: { startsWith: p } },
      orderBy: { settlementCode: 'desc' },
      select: { settlementCode: true },
    })
    return row?.settlementCode ?? null
  })
}

export async function nextWriteoffCode(db: { receivableWriteoff: any }) {
  return nextDailyCode(undefined, 'WOF', async (p) => {
    const row = await db.receivableWriteoff.findFirst({
      where: { writeoffCode: { startsWith: p } },
      orderBy: { writeoffCode: 'desc' },
      select: { writeoffCode: true },
    })
    return row?.writeoffCode ?? null
  })
}

export async function nextRefundOrderCode(db: { refundOrder: any }) {
  return nextDailyCode(undefined, 'RFO', async (p) => {
    const row = await db.refundOrder.findFirst({
      where: { refundCode: { startsWith: p } },
      orderBy: { refundCode: 'desc' },
      select: { refundCode: true },
    })
    return row?.refundCode ?? null
  })
}

export async function nextCashFlowCode(db: { cashFlow: any }) {
  return nextDailyCode(undefined, 'CFL', async (p) => {
    const row = await db.cashFlow.findFirst({
      where: { flowCode: { startsWith: p } },
      orderBy: { flowCode: 'desc' },
      select: { flowCode: true },
    })
    return row?.flowCode ?? null
  })
}

export function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function dec(n: number) {
  return new Prisma.Decimal(round2(n))
}

export function dateOnlyStr(d: Date | null | undefined): string {
  if (!d) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
