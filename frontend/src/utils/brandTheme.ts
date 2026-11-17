/** 将主题色写入 :root CSS 变量（含 Element Plus 主色衍生） */

const HEX_RE = /^#([0-9A-Fa-f]{6})$/

export function isHexColor(raw: string | null | undefined): boolean {
  return HEX_RE.test(String(raw ?? '').trim())
}

export function normalizeHexColor(raw: string | null | undefined, fallback = '#0f4a32'): string {
  const s = String(raw ?? '').trim()
  if (HEX_RE.test(s)) return s.toLowerCase()
  return fallback
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = HEX_RE.exec(hex.trim())
  if (!m) return null
  const n = Number.parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  )
}

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  }
}

function shadeHex(hex: string, factor: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor)
}

function mixHex(hex: string, other: string, t: number): string {
  const a = hexToRgb(hex)
  const b = hexToRgb(other)
  if (!a || !b) return hex
  const m = mixRgb(a, b, t)
  return rgbToHex(m.r, m.g, m.b)
}

export type BrandThemeVars = {
  brand: string
  brandDark: string
  brandMid: string
  brandLight: string
  sidebarFrom: string
  sidebarMid: string
  sidebarTo: string
  loginFrom: string
  loginMid: string
  loginTo: string
  loginPageFrom: string
  loginPageMid: string
  loginPageTo: string
}

/** 登录左栏历史色（比侧栏主题绿更亮的橄榄绿） */
const LOGIN_FROM_ANCHOR = '#4a6b52'
const LOGIN_MID_ANCHOR = '#3e5b45'
const LOGIN_TO_ANCHOR = '#243029'
/** 登录页整页背景历史色 */
const LOGIN_PAGE_FROM_ANCHOR = '#243029'
const LOGIN_PAGE_MID_ANCHOR = '#3e5b45'
const LOGIN_PAGE_TO_ANCHOR = '#2a3f31'
const DEFAULT_BRAND = '#0f4a32'

export function buildBrandThemeVars(themeColor: string): BrandThemeVars {
  const brand = normalizeHexColor(themeColor)
  const brandDark = shadeHex(brand, 0.82)
  const brandMid = mixHex(brand, '#ffffff', 0.28)
  const brandLight = mixHex(brand, '#ffffff', 0.55)
  const isDefaultBrand = brand === DEFAULT_BRAND
  /** 自定义主题：登录区以主题色为主推导（整页 + 左栏同色系） */
  const loginFrom = isDefaultBrand ? LOGIN_FROM_ANCHOR : mixHex(brand, '#ffffff', 0.42)
  const loginMid = isDefaultBrand ? LOGIN_MID_ANCHOR : mixHex(brand, '#ffffff', 0.22)
  const loginTo = isDefaultBrand ? LOGIN_TO_ANCHOR : mixHex(brandDark, '#1a1218', 0.35)
  return {
    brand,
    brandDark,
    brandMid,
    brandLight,
    sidebarFrom: mixHex(brand, '#ffffff', 0.12),
    sidebarMid: brand,
    sidebarTo: brandDark,
    loginFrom,
    loginMid,
    loginTo,
    loginPageFrom: isDefaultBrand ? LOGIN_PAGE_FROM_ANCHOR : loginTo,
    loginPageMid: isDefaultBrand ? LOGIN_PAGE_MID_ANCHOR : loginMid,
    loginPageTo: isDefaultBrand ? LOGIN_PAGE_TO_ANCHOR : brandDark,
  }
}

export function applyBrandThemeToDocument(themeColor: string) {
  const vars = buildBrandThemeVars(themeColor)
  const root = document.documentElement
  root.style.setProperty('--lb-brand', vars.brand)
  root.style.setProperty('--lb-brand-dark', vars.brandDark)
  root.style.setProperty('--lb-brand-mid', vars.brandMid)
  root.style.setProperty('--lb-brand-light', vars.brandLight)
  root.style.setProperty('--lb-sidebar-from', vars.sidebarFrom)
  root.style.setProperty('--lb-sidebar-mid', vars.sidebarMid)
  root.style.setProperty('--lb-sidebar-to', vars.sidebarTo)
  root.style.setProperty('--lb-login-brand-from', vars.loginFrom)
  root.style.setProperty('--lb-login-brand-mid', vars.loginMid)
  root.style.setProperty('--lb-login-brand-to', vars.loginTo)
  root.style.setProperty('--lb-login-page-from', vars.loginPageFrom)
  root.style.setProperty('--lb-login-page-mid', vars.loginPageMid)
  root.style.setProperty('--lb-login-page-to', vars.loginPageTo)
  root.style.setProperty('--el-color-primary', vars.brand)
  root.style.setProperty('--el-color-primary-light-3', mixHex(vars.brand, '#ffffff', 0.3))
  root.style.setProperty('--el-color-primary-light-5', mixHex(vars.brand, '#ffffff', 0.5))
  root.style.setProperty('--el-color-primary-light-7', mixHex(vars.brand, '#ffffff', 0.7))
  root.style.setProperty('--el-color-primary-light-8', mixHex(vars.brand, '#ffffff', 0.8))
  root.style.setProperty('--el-color-primary-light-9', mixHex(vars.brand, '#ffffff', 0.9))
  root.style.setProperty('--el-color-primary-dark-2', vars.brandDark)
  root.style.setProperty('--el-switch-on-color', vars.brand)
}
