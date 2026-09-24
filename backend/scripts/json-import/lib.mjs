/**
 * 简道云 export.json 共用工具（工程师 JSON 导入）
 */
import fs from 'fs'
import path from 'path'
import { Prisma } from '@prisma/client'

export function dataRoot() {
  return path.join(process.cwd(), '..', 'data')
}

export function folderByPrefix(prefix) {
  const root = dataRoot()
  const name = fs.readdirSync(root).find((n) => n.startsWith(prefix))
  if (!name) throw new Error(`找不到 data/${prefix}* 目录`)
  return path.join(root, name)
}

/** @returns {{ file: string, rows: any[], fields: Record<string,string>, fieldMeta: any[] }} */
export function loadEntity(folderPrefix, nameIncludes) {
  const dir = folderByPrefix(folderPrefix)
  const file = fs.readdirSync(dir).find((n) => n.includes(nameIncludes) && n.endsWith('.json'))
  if (!file) throw new Error(`在 ${dir} 找不到含「${nameIncludes}」的 json`)
  const full = path.join(dir, file)
  const payload = JSON.parse(fs.readFileSync(full, 'utf8'))
  const fieldMeta = payload.meta?.field || []
  const fields = Object.fromEntries(fieldMeta.map((f) => [f._name, f._id]))
  return { file: full, rows: payload.data || [], fields, fieldMeta }
}

export function s(v) {
  if (v == null) return ''
  return String(v).trim()
}

export function num(v) {
  if (v == null || v === '') return 0
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function dec(v) {
  return new Prisma.Decimal(num(v))
}

export function decOrNull(v) {
  if (v == null || v === '') return null
  const n = num(v)
  return Number.isFinite(n) ? new Prisma.Decimal(n) : null
}

/** 简道云日期常为 YYYY-MM-DD */
export function dateOrNull(v) {
  const t = s(v)
  if (!t) return null
  const d = new Date(t.includes('T') ? t : `${t}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function dataOf(row, fields, name) {
  const id = fields[name]
  if (!id) return ''
  return row._data?.[id]
}

/** 无业务编号时用旧 id 生成唯一码（避免与正式 Excel 编号冲突） */
export function codeFromLegacy(prefix, legacyId) {
  const tail = s(legacyId).replace(/[^a-zA-Z0-9]/g, '').slice(-12).toUpperCase()
  return `${prefix}${tail || Date.now().toString(36).toUpperCase()}`
}

export function mapRoomStatus(raw) {
  const t = s(raw)
  if (/退租|terminat/i.test(t)) return 'terminating'
  if (/签约|簽署|signing/i.test(t)) return 'signing'
  if (/租赁|租賃|已租|leased/i.test(t)) return 'leased'
  if (/闲置|空置|idle/i.test(t)) return 'idle'
  return 'idle'
}

export function mapRoomConfigType(raw) {
  const t = s(raw)
  if (/窗|window/i.test(t)) return 'window'
  if (/空调|空調|ac/i.test(t)) return 'ac'
  return 'size'
}

export function dryRunFlag() {
  return process.argv.includes('--dry-run')
}

export function logPhase(name, stats) {
  console.log(`\n== ${name} ==`)
  console.log(stats)
}
