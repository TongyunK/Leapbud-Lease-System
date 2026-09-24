/**
 * 清空业务数据（保留：用户/角色/菜单/单据模板）。
 *
 * 用法（backend 目录）：
 *   node scripts/json-import/wipe-business-data.mjs --confirm
 *   node scripts/json-import/wipe-business-data.mjs --confirm --dry-run
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const confirm = process.argv.includes('--confirm')
const dryRun = process.argv.includes('--dry-run')

/** 按 FK 安全顺序：子表先删 */
const TABLES = [
  'receipts',
  'receivables',
  'invoice_service_details',
  'invoices',
  'deposit_refunds',
  'contract_other_fees',
  'lease_terminations',
  'contract_periods',
  'contracts',
  'customer_requirements',
  'occupants',
  'customers',
  'rooms',
  'room_config_options',
  'buildings',
  // 可选字典是否清空：默认不清 room_type_options / customer_sources / contract_configs
]

async function main() {
  if (!confirm) {
    console.error('必须加 --confirm 才会执行清空。例：node scripts/json-import/wipe-business-data.mjs --confirm')
    process.exitCode = 1
    return
  }
  console.log(dryRun ? '[dry-run] 将清空：' : '[write] 清空：', TABLES.join(', '))
  if (dryRun) return

  // 先解开客户主联络人，避免 occupants <-> customers 环
  await prisma.$executeRawUnsafe(`UPDATE "customers" SET "primary_occupant_id" = NULL`)

  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`)
    console.log('truncated', table)
  }
  console.log('完成。用户/角色/菜单/单据模板已保留。')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
