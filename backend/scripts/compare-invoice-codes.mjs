import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()
try {
  const dataRoot = path.join(process.cwd(), '..', 'data')
  const finDir = path.join(
    dataRoot,
    fs.readdirSync(dataRoot).find((n) => n.startsWith('4.')),
  )
  const inv = JSON.parse(
    fs.readFileSync(
      path.join(finDir, fs.readdirSync(finDir).find((n) => n.includes('發票'))),
      'utf8',
    ),
  )
  const CODE = '6698a47694bc9400ac0c2451'
  const oldCodes = new Set()
  let blank = 0
  for (const r of inv.data) {
    const c = (r._data?.[CODE] ?? '').toString().trim()
    if (c) oldCodes.add(c.toLowerCase())
    else blank += 1
  }
  const dbCodes = await prisma.invoice.findMany({ select: { invoiceCode: true } })
  const dbSet = new Set(dbCodes.map((x) => x.invoiceCode.toLowerCase()))
  let hit = 0
  let miss = 0
  for (const c of oldCodes) {
    if (dbSet.has(c)) hit += 1
    else miss += 1
  }
  console.log({
    oldWithCode: oldCodes.size,
    oldBlank: blank,
    dbTotal: dbCodes.length,
    codeHits: hit,
    codeMiss: miss,
  })
} finally {
  await prisma.$disconnect()
}
