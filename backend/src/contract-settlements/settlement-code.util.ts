import { Prisma } from '@prisma/client'

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
