/** 根据 Logo URL 推断 favicon 的 MIME type */
export function faviconMimeFromUrl(url: string): string {
  const path = String(url || '').split('?')[0] || ''
  if (/\.svg$/i.test(path) || /image\/svg/i.test(url)) return 'image/svg+xml'
  if (/\.webp$/i.test(path) || /image\/webp/i.test(url)) return 'image/webp'
  if (/\.jpe?g$/i.test(path) || /image\/jpe?g/i.test(url)) return 'image/jpeg'
  if (/\.gif$/i.test(path) || /image\/gif/i.test(url)) return 'image/gif'
  if (/\.ico$/i.test(path)) return 'image/x-icon'
  return 'image/png'
}

/**
 * 将浏览器标签页 favicon 切到当前品牌 Logo。
 * 加 cache-bust，避免换 Logo 后仍显示旧图标。
 */
export function applyDocumentFavicon(url: string) {
  if (typeof document === 'undefined') return
  const raw = String(url || '').trim() || '/leapbud_logo.png'
  const sep = raw.includes('?') ? '&' : '?'
  const href = `${raw}${sep}v=${Date.now()}`
  const type = faviconMimeFromUrl(raw)

  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.type = type
  link.href = href

  let shortcut = document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']")
  if (!shortcut) {
    shortcut = document.createElement('link')
    shortcut.rel = 'shortcut icon'
    document.head.appendChild(shortcut)
  }
  shortcut.type = type
  shortcut.href = href
}

/**
 * 探测 Logo 是否含透明像素（无边 PNG／WebP 等）。
 * 用于登录／侧栏去掉方框底板与矩形阴影。
 */
export function probeImageHasTransparency(url: string): Promise<boolean> {
  const src = String(url || '').trim()
  if (!src) return Promise.resolve(false)

  return new Promise((resolve) => {
    const img = new Image()
    // 同源 uploads／public 可读像素；跨域失败时按扩展名兜底
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'

    img.onload = () => {
      try {
        const nw = img.naturalWidth || 0
        const nh = img.naturalHeight || 0
        if (!nw || !nh) {
          resolve(guessTransparentByUrl(src))
          return
        }
        const max = 64
        const scale = Math.min(1, max / Math.max(nw, nh))
        const w = Math.max(1, Math.round(nw * scale))
        const h = Math.max(1, Math.round(nh * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          resolve(guessTransparentByUrl(src))
          return
        }
        ctx.clearRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)
        for (let i = 3; i < data.length; i += 4) {
          if (data[i]! < 250) {
            resolve(true)
            return
          }
        }
        resolve(false)
      } catch {
        resolve(guessTransparentByUrl(src))
      }
    }

    img.onerror = () => resolve(guessTransparentByUrl(src))
    img.src = src
  })
}

function guessTransparentByUrl(url: string): boolean {
  const path = url.split('?')[0] || url
  return /\.(png|webp|svg)$/i.test(path) || /image\/(png|webp|svg)/i.test(url)
}
