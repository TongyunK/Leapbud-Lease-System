import type { MenuRecord } from '@/types/menu'

type Translate = (key: string, values?: Record<string, unknown>) => string
type TranslateExists = (key: string) => boolean

/** 按系统语言取菜单显示名：中文用 name，英文优先 nameEn，再兜底 nameKey / name */
export function menuDisplayName(
  node: Pick<MenuRecord, 'name' | 'nameEn' | 'nameKey'>,
  locale: string,
  t: Translate,
  te: TranslateExists,
): string {
  const isZh = String(locale || '').toLowerCase().startsWith('zh')
  const zh = String(node.name ?? '').trim()
  const en = String(node.nameEn ?? '').trim()
  if (isZh) {
    if (zh) return zh
  } else if (en) {
    return en
  }
  const key = String(node.nameKey ?? '').trim()
  if (key && te(key)) return t(key)
  return zh || en || '—'
}
