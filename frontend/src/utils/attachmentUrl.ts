/** 附件 storageKey / 旧路径 → 浏览器可访问的 /files/ URL */
export function attachmentPublicUrl(storageKey?: string | null): string {
  const key = (storageKey || '').trim()
  if (!key) return ''
  if (/^https?:\/\//i.test(key)) return key
  const rel = key.replace(/^\/+/, '').replace(/^upload\//i, 'upload/')
  if (!rel || rel.includes('..')) return ''
  return `/files/${rel}`
}

export function attachmentFileName(storageKey?: string | null): string {
  const key = (storageKey || '').trim()
  if (!key) return ''
  if (/^https?:\/\//i.test(key)) {
    try {
      const u = new URL(key)
      return decodeURIComponent(u.pathname.split('/').pop() || key)
    } catch {
      return key
    }
  }
  const base = key.split(/[/\\]/).pop() || key
  // uuid-filename.ext → filename.ext
  return base.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    '',
  )
}

export function isPdfAttachment(storageKey?: string | null): boolean {
  const name = attachmentFileName(storageKey).toLowerCase()
  return name.endsWith('.pdf') || /\.pdf(\?|$)/i.test((storageKey || '').trim())
}

export function isImageAttachment(storageKey?: string | null): boolean {
  const name = attachmentFileName(storageKey).toLowerCase()
  return /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(name)
}
