/**
 * 从简道云「服务细节」JSON 导入到 invoice_service_details。
 * 依赖：invoices.legacy_id 已用 sync-invoice-legacy-ids-from-json.mjs 回填。
 *
 * 关联：服务细节._data[所属发票] = 旧发票 _id → Invoice.legacyId → Invoice.id
 *
 * 用法（在 backend 目录）：
 *   node scripts/import-service-details-from-json.mjs
 *   node scripts/import-service-details-from-json.mjs --dry-run
 *
 * 默认读：../data/4.财务管理/ 下的服务细节 export.json
 */
import fs from 'fs'
import path from 'path'
import { PrismaClient, Prisma } from '@prisma/client'

const dryRun = process.argv.includes('--dry-run')
const prisma = new PrismaClient()

const FIELD = {
  invoiceRef: '6698aa81a7f84c00b0a44ae5',
  description: '6698aa81a7f84c00b0a44ae6',
  quantity: '6698aa81a7f84c00b0a44ae7',
  unitAmount: '6698aa81a7f84c00b0a44ae8',
  subtotal: '6698aa81a7f84c00b0a44ae9',
  remark: '6698aa81a7f84c00b0a44aea',
}

function financeDir() {
  const root = path.join(process.cwd(), '..', 'data')
  const name = fs.readdirSync(root).find((n) => n.startsWith('4.'))
  if (!name) throw new Error('找不到 data/4.* 财务管理目录')
  return path.join(root, name)
}

function serviceDetailJsonPath() {
  const dir = financeDir()
  const name = fs
    .readdirSync(dir)
    .find((n) => n.includes('服務細節') && n.endsWith('.json'))
  if (!name) throw new Error('找不到服务细节 export.json')
  return path.join(dir, name)
}

function s(v) {
  return (v ?? '').toString().trim()
}

function num(v) {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function dec(n) {
  return new Prisma.Decimal(Number(n) || 0)
}

async function main() {
  const file = serviceDetailJsonPath()
  console.log(dryRun ? '[dry-run]' : '[write]', file)
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  const rows = payload.data || []
  console.log('old service details', rows.length)

  const invoices = await prisma.invoice.findMany({
    where: { legacyId: { not: null } },
    select: { id: true, legacyId: true, invoiceCode: true },
  })
  const byLegacy = new Map(invoices.map((inv) => [inv.legacyId, inv]))
  console.log('invoices with legacyId', byLegacy.size)

  // 已有明细去重：invoiceId|desc|qty|unit
  const existing = await prisma.invoiceServiceDetail.findMany({
    select: {
      invoiceId: true,
      description: true,
      quantity: true,
      unitAmount: true,
    },
  })
  const seen = new Set(
    existing.map(
      (r) =>
        `${r.invoiceId}|${(r.description || '').toLowerCase()}|${r.quantity.toString()}|${r.unitAmount.toString()}`,
    ),
  )

  let created = 0
  let skipped = 0
  let unlinked = 0
  let noRef = 0
  const unlinkedSamples = []

  const batch = []
  const BATCH_SIZE = 200

  async function flush() {
    if (!batch.length || dryRun) {
      batch.length = 0
      return
    }
    await prisma.invoiceServiceDetail.createMany({ data: batch })
    batch.length = 0
  }

  for (const row of rows) {
    const legacyInvoiceId = s(row._data?.[FIELD.invoiceRef])
    const description = s(row._data?.[FIELD.description])
    const quantity = num(row._data?.[FIELD.quantity])
    const unitAmount = num(row._data?.[FIELD.unitAmount])
    let subtotal = num(row._data?.[FIELD.subtotal])
    if (!subtotal && (quantity || unitAmount)) subtotal = quantity * unitAmount
    const remark = s(row._data?.[FIELD.remark])

    if (!legacyInvoiceId) {
      noRef += 1
      continue
    }

    const invoice = byLegacy.get(legacyInvoiceId)
    if (!invoice) {
      unlinked += 1
      if (unlinkedSamples.length < 8) {
        unlinkedSamples.push({ legacyInvoiceId, description: description.slice(0, 40) })
      }
      continue
    }

    const dupKey = `${invoice.id}|${description.toLowerCase()}|${dec(quantity).toString()}|${dec(unitAmount).toString()}`
    if (seen.has(dupKey)) {
      skipped += 1
      continue
    }
    seen.add(dupKey)

    created += 1
    if (!dryRun) {
      batch.push({
        invoiceId: invoice.id,
        description,
        quantity: dec(quantity),
        unitAmount: dec(unitAmount),
        subtotal: dec(subtotal),
        remark,
        sortOrder: 0,
      })
      if (batch.length >= BATCH_SIZE) await flush()
    }
  }

  await flush()

  console.log({ created, skippedDup: skipped, unlinked, noInvoiceRef: noRef })
  if (unlinkedSamples.length) {
    console.log('unlinked samples (发票尚未回填 legacyId，多为无编号旧票):')
    console.log(unlinkedSamples)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
