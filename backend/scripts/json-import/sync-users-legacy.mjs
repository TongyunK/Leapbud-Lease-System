/**
 * 用 data/userList.xlsx 把旧系统用户 _id 写入本系统 User.legacyId。
 * 不删除现有用户；缺账号时可选创建（默认密码 Import123!）。
 *
 * 用法（backend 目录）：
 *   node scripts/json-import/sync-users-legacy.mjs --dry-run
 *   node scripts/json-import/sync-users-legacy.mjs
 *   node scripts/json-import/sync-users-legacy.mjs --create-missing
 */
import fs from 'fs'
import path from 'path'
import xlsx from 'xlsx'
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'
import { dryRunFlag } from './lib.mjs'

const prisma = new PrismaClient()
const dryRun = dryRunFlag()
const createMissing = process.argv.includes('--create-missing')

/** 旧名称/账号 → 本系统 account（手工别名） */
const ACCOUNT_ALIASES = {
  admin: 'admin',
  Admin: 'admin',
}

function xlsxPath() {
  return path.join(process.cwd(), '..', 'data', 'userList.xlsx')
}

function candidatesFromRow(row) {
  const names = [row['名称'], row['用户'], row['名稱'], row['用戶']]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
  const out = []
  for (const n of names) {
    out.push(n)
    if (ACCOUNT_ALIASES[n]) out.push(ACCOUNT_ALIASES[n])
  }
  return [...new Set(out)]
}

function findUser(dbUsers, row) {
  const cands = candidatesFromRow(row)
  for (const c of cands) {
    const hit = dbUsers.find(
      (u) => u.account === c || u.displayName === c,
    )
    if (hit) return hit
  }
  const lower = cands.map((c) => c.toLowerCase())
  return dbUsers.find(
    (u) =>
      lower.includes(u.account.toLowerCase()) ||
      lower.includes((u.displayName || '').toLowerCase()),
  )
}

async function main() {
  const file = xlsxPath()
  if (!fs.existsSync(file)) {
    throw new Error(`找不到 ${file}`)
  }
  const wb = xlsx.readFile(file)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' })
  const dbUsers = await prisma.user.findMany({
    select: { id: true, account: true, displayName: true, legacyId: true },
  })

  console.log(dryRun ? '[dry-run] 同步用户 legacyId' : '[write] 同步用户 legacyId')
  console.log(`excel=${rows.length}, dbUsers=${dbUsers.length}, createMissing=${createMissing}`)

  let linked = 0
  let created = 0
  let skipped = 0
  let conflict = 0
  const defaultHash = await bcrypt.hash('Import123!', 10)

  for (const row of rows) {
    const legacyId = String(row._id ?? '').trim()
    if (!legacyId) {
      skipped += 1
      continue
    }
    const already = dbUsers.find((u) => u.legacyId === legacyId)
    if (already) {
      console.log('  ok(已有)', already.account, '←', legacyId)
      linked += 1
      continue
    }

    let user = findUser(dbUsers, row)
    if (!user && createMissing) {
      const account =
        String(row['用户'] || row['用戶'] || row['名称'] || row['名稱'] || '').trim() ||
        `legacy_${legacyId.slice(-8)}`
      const displayName =
        String(row['名称'] || row['名稱'] || row['用户'] || row['用戶'] || account).trim()
      if (dbUsers.some((u) => u.account === account)) {
        console.log('  skip(账号已存在无法匹配)', account, legacyId)
        skipped += 1
        continue
      }
      if (!dryRun) {
        user = await prisma.user.create({
          data: {
            account,
            displayName,
            passwordHash: defaultHash,
            role: 'user',
            status: 'active',
            legacyId,
          },
        })
        dbUsers.push(user)
      } else {
        console.log('  would-create', account, '←', legacyId)
        created += 1
        continue
      }
      console.log('  created', user.account, '←', legacyId)
      created += 1
      linked += 1
      continue
    }

    if (!user) {
      console.log(
        '  miss',
        candidatesFromRow(row).join('|') || '(空)',
        legacyId,
        '（加 --create-missing 可建账号）',
      )
      skipped += 1
      continue
    }

    if (user.legacyId && user.legacyId !== legacyId) {
      console.log('  conflict', user.account, '已有', user.legacyId, '≠', legacyId)
      conflict += 1
      continue
    }

    if (!dryRun) {
      await prisma.user.update({
        where: { id: user.id },
        data: { legacyId },
      })
      user.legacyId = legacyId
    }
    console.log('  link', user.account, '←', legacyId)
    linked += 1
  }

  console.log({ linked, created, skipped, conflict })
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
