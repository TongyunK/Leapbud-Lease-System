/**
 * 从简道云「发票」JSON 回填 invoices.legacy_id（旧 _id）。
 *
 * 匹配策略（按优先级）：
 * 1. 已有 legacyId 相同 → 跳过
 * 2. 发票编号非空 → 按 invoiceCode 精确匹配
 *
 * 用法（在 backend 目录）：
 *   node scripts/sync-invoice-legacy-ids-from-json.mjs
 *   node scripts/sync-invoice-legacy-ids-from-json.mjs --dry-run
 *
 * 默认读：../data/4.财务管理/ 下的发票 export.json
 */
import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const dryRun = process.argv.includes('--dry-run')
const prisma = new PrismaClient()

const FIELD = {
  invoiceCode: '6698a47694bc9400ac0c2451',
}

function dataRoot() {
  return path.join(process.cwd(), '..', 'data')
}

function financeDir() {
  const root = dataRoot()
  const name = fs.readdirSync(root).find((n) => n.startsWith('4.'))
  if (!name) throw new Error('找不到 data/4.* 财务管理目录')
  return path.join(root, name)
}

function invoiceJsonPath() {
  const dir = financeDir()
  const name = fs.readdirSync(dir).find((n) => n.includes('發票') && n.endsWith('.json'))
  if (!name) throw new Error('找不到发票 export.json')
  return path.join(dir, name)
}

function s(v) {
  return (v ?? '').toString().trim()
}

async function main() {
  const file = invoiceJsonPath()
  console.log(dryRun ? '[dry-run]' : '[write]', file)
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  const rows = payload.data || []
  console.log('old invoices', rows.length)

  const db = await prisma.invoice.findMany({
    select: { id: true, invoiceCode: true, legacyId: true },
  })
  const byCode = new Map()
  const byLegacy = new Map()
  for (const inv of db) {
    byCode.set(inv.invoiceCode.toLowerCase(), inv)
    if (inv.legacyId) byLegacy.set(inv.legacyId, inv)
  }

  let linked = 0
  let already = 0
  let noCode = 0
  let missing = 0
  let conflict = 0

  for (const row of rows) {
    const legacyId = s(row._id)
    const code = s(row._data?.[FIELD.invoiceCode])
    if (!legacyId) continue

    if (byLegacy.has(legacyId)) {
      already += 1
      continue
    }

    if (!code) {
      noCode += 1
      continue
    }

    const hit = byCode.get(code.toLowerCase())
    if (!hit) {
      missing += 1
      continue
    }
    if (hit.legacyId && hit.legacyId !== legacyId) {
      conflict += 1
      console.warn('conflict', code, hit.legacyId, 'vs', legacyId)
      continue
    }

    if (!dryRun) {
      await prisma.invoice.update({
        where: { id: hit.id },
        data: { legacyId },
      })
    }
    hit.legacyId = legacyId
    byLegacy.set(legacyId, hit)
    linked += 1
  }

  console.log({
    linked,
    already,
    noCodeSkipped: noCode,
    codeNotInDb: missing,
    conflict,
  })
  console.log(
    '说明：无发票编号的旧记录无法按编号回填 legacyId；需另做业务字段匹配或重新从 JSON 建票。',
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
