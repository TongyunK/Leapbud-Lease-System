/**
 * 对照业务表「当前周期」最大编号，回写 numbering_rules.current_seq / period_key，
 * 并按格式占位符校正 reset_cycle：
 * - 含 %DD / 时分秒 → daily
 * - 含 %MM（无日）→ monthly
 * - 含 %YY / %YYYY → yearly
 * - 无日期 → none
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function pad(n, w) {
  return String(n).padStart(w, '0')
}

function periodKeyOf(date, cycle) {
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1, 2)
  const d = pad(date.getDate(), 2)
  switch (cycle) {
    case 'daily':
      return `${y}${m}${d}`
    case 'monthly':
      return `${y}${m}`
    case 'yearly':
      return String(y)
    default:
      return ''
  }
}

function resetCycleForFormat(format) {
  if (format.includes('%DD') || format.includes('%HH') || format.includes('%mm') || format.includes('%ss')) {
    return 'daily'
  }
  if (format.includes('%MM')) return 'monthly'
  if (format.includes('%YY') || format.includes('%YYYY')) return 'yearly'
  return 'none'
}

function renderPrefix(format, date) {
  const y = date.getFullYear()
  const M = date.getMonth() + 1
  const D = date.getDate()
  const H = date.getHours()
  const min = date.getMinutes()
  const s = date.getSeconds()
  let out = ''
  let i = 0
  while (i < format.length) {
    if (format[i] === '%' && i + 1 < format.length) {
      if (format[i + 1] === '%') {
        out += '%'
        i += 2
        continue
      }
      const rest = format.slice(i)
      if (rest.startsWith('%YYYY')) {
        out += String(y)
        i += 5
        continue
      }
      if (rest.startsWith('%YY')) {
        out += String(y).slice(-2)
        i += 3
        continue
      }
      if (rest.startsWith('%MM')) {
        out += pad(M, 2)
        i += 3
        continue
      }
      if (rest.startsWith('%DD')) {
        out += pad(D, 2)
        i += 3
        continue
      }
      if (rest.startsWith('%HH')) {
        out += pad(H, 2)
        i += 3
        continue
      }
      if (rest.startsWith('%mm')) {
        out += pad(min, 2)
        i += 3
        continue
      }
      if (rest.startsWith('%ss')) {
        out += pad(s, 2)
        i += 3
        continue
      }
      const seqMatch = rest.match(/^%0(\d+)d/)
      if (seqMatch) {
        i += seqMatch[0].length
        continue
      }
      if (rest.startsWith('%d')) {
        i += 2
        continue
      }
    }
    out += format[i]
    i += 1
  }
  return out
}

function parseSeqFromCode(code, prefix) {
  if (!code || !prefix) return null
  const raw = String(code)
  const base = raw.split('-')[0]
  // 先整段（收据 202611-D057），再去发票房间后缀（W263061-KT9A03C）
  for (const c of [raw, base]) {
    if (!c.startsWith(prefix)) continue
    const seqStr = c.slice(prefix.length)
    if (!/^\d+$/.test(seqStr)) continue
    const seq = Number(seqStr)
    if (Number.isFinite(seq)) return seq
  }
  return null
}

/** 各业务：按前缀 startsWith 拉本周期编号 */
const FETCHERS = {
  customer: (prefix) =>
    prisma.customer.findMany({
      where: { customerCode: { startsWith: prefix } },
      select: { customerCode: true },
      orderBy: { customerCode: 'desc' },
      take: 50,
    }),
  customerRequirement: (prefix) =>
    prisma.customerRequirement.findMany({
      where: { requirementCode: { startsWith: prefix } },
      select: { requirementCode: true },
      orderBy: { requirementCode: 'desc' },
      take: 50,
    }),
  invoice: (prefix) =>
    prisma.invoice.findMany({
      where: { invoiceCode: { startsWith: prefix } },
      select: { invoiceCode: true },
      orderBy: { invoiceCode: 'desc' },
      take: 80,
    }),
  receipt: (prefix) =>
    prisma.receipt.findMany({
      where: { receiptCode: { startsWith: prefix } },
      select: { receiptCode: true },
      orderBy: { receiptCode: 'desc' },
      take: 50,
    }),
  receivable: (prefix) =>
    prisma.receivable.findMany({
      where: { receivableCode: { startsWith: prefix } },
      select: { receivableCode: true },
      orderBy: { receivableCode: 'desc' },
      take: 50,
    }),
  depositRefund: (prefix) =>
    prisma.depositRefund.findMany({
      where: { refundCode: { startsWith: prefix } },
      select: { refundCode: true },
      orderBy: { refundCode: 'desc' },
      take: 50,
    }),
  contractSettlement: (prefix) =>
    prisma.contractSettlement.findMany({
      where: { settlementCode: { startsWith: prefix } },
      select: { settlementCode: true },
      orderBy: { settlementCode: 'desc' },
      take: 50,
    }),
  refundOrder: (prefix) =>
    prisma.refundOrder.findMany({
      where: { refundCode: { startsWith: prefix } },
      select: { refundCode: true },
      orderBy: { refundCode: 'desc' },
      take: 50,
    }),
  cashFlow: (prefix) =>
    prisma.cashFlow.findMany({
      where: { flowCode: { startsWith: prefix } },
      select: { flowCode: true },
      orderBy: { flowCode: 'desc' },
      take: 80,
    }),
  receivableWriteoff: (prefix) =>
    prisma.receivableWriteoff.findMany({
      where: { writeoffCode: { startsWith: prefix } },
      select: { writeoffCode: true },
      orderBy: { writeoffCode: 'desc' },
      take: 50,
    }),
}

function codeOf(bizKey, row) {
  switch (bizKey) {
    case 'customer':
      return row.customerCode
    case 'customerRequirement':
      return row.requirementCode
    case 'invoice':
      return row.invoiceCode
    case 'receipt':
      return row.receiptCode
    case 'receivable':
      return row.receivableCode
    case 'depositRefund':
    case 'refundOrder':
      return row.refundCode
    case 'contractSettlement':
      return row.settlementCode
    case 'cashFlow':
      return row.flowCode
    case 'receivableWriteoff':
      return row.writeoffCode
    default:
      return null
  }
}

async function main() {
  const now = new Date()
  const rules = await prisma.numberingRule.findMany({
    where: { bizKey: { not: null } },
    orderBy: { sortOrder: 'asc' },
  })

  const report = []

  for (const rule of rules) {
    const bizKey = rule.bizKey
    if (!bizKey || !FETCHERS[bizKey]) {
      report.push({ bizKey, skipped: true, reason: 'no fetcher' })
      continue
    }

    const nextCycle = resetCycleForFormat(rule.format)
    const periodKey = nextCycle === 'none' ? '' : periodKeyOf(now, nextCycle)
    const prefix = renderPrefix(rule.format, now)

    const rows = await FETCHERS[bizKey](prefix)
    let maxSeq = 0
    let sample = null
    for (const row of rows) {
      const code = codeOf(bizKey, row)
      const seq = parseSeqFromCode(code, prefix)
      if (seq != null && seq > maxSeq) {
        maxSeq = seq
        sample = code
      }
    }

    const currentSeq = maxSeq > 0 ? maxSeq : rule.startValue - 1

    const updated = await prisma.numberingRule.update({
      where: { id: rule.id },
      data: {
        resetCycle: nextCycle,
        currentSeq,
        periodKey,
      },
    })

    report.push({
      bizKey,
      format: rule.format,
      prefix,
      resetCycle: `${rule.resetCycle} → ${updated.resetCycle}`,
      currentSeq: `${rule.currentSeq} → ${updated.currentSeq}`,
      periodKey: `${rule.periodKey || '(empty)'} → ${updated.periodKey || '(empty)'}`,
      matchedSample: sample,
      hitCount: rows.length,
    })
  }

  console.log(JSON.stringify(report, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
