import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { fetchPublicBrandingApi } from '@/api/system-settings'
import { applyBrandThemeToDocument } from '@/utils/brandTheme'
import { attachmentPublicUrl } from '@/utils/attachmentUrl'
import { applyDocumentFavicon, probeImageHasTransparency } from '@/utils/logoFrame'
import type { BrandingConfig } from '@/types/system-setting'

const DEFAULT_LOGO = '/leapbud_logo.png'

export const DEFAULT_BRANDING: BrandingConfig = {
  logoKey: '',
  logoUrl: DEFAULT_LOGO,
  themeColor: '#0f4a32',
  title: 'leapbud',
  subtitle: '租賃管理系統',
}

function resolveLogoUrl(cfg: Partial<BrandingConfig> | null | undefined): string {
  const key = String(cfg?.logoKey || '').trim()
  if (key) {
    const fromKey = attachmentPublicUrl(key)
    if (fromKey) return fromKey
  }
  const url = String(cfg?.logoUrl || '').trim()
  if (url) return url
  return DEFAULT_LOGO
}

export const useBrandingStore = defineStore('branding', () => {
  const branding = ref<BrandingConfig>({ ...DEFAULT_BRANDING })
  const loaded = ref(false)
  const loading = ref(false)

  const logoUrl = computed(() => resolveLogoUrl(branding.value))
  const title = computed(() => branding.value.title || DEFAULT_BRANDING.title)
  const subtitle = computed(() => branding.value.subtitle || DEFAULT_BRANDING.subtitle)
  const themeColor = computed(() => branding.value.themeColor || DEFAULT_BRANDING.themeColor)
  /** 登录页大标题：公司名称 + 空格 + 系统名称 */
  const loginHeroTitle = computed(() =>
    [title.value, subtitle.value].map((s) => String(s || '').trim()).filter(Boolean).join(' '),
  )
  /** 透明无边 Logo：登录／侧栏去掉方框底板 */
  const logoFrameless = ref(false)
  let logoProbeSeq = 0

  async function refreshLogoFrame(url: string) {
    const seq = ++logoProbeSeq
    const hasAlpha = await probeImageHasTransparency(url)
    if (seq !== logoProbeSeq) return
    logoFrameless.value = hasAlpha
  }

  watch(
    logoUrl,
    (url) => {
      applyDocumentFavicon(url)
      void refreshLogoFrame(url)
    },
    { immediate: true },
  )

  function applyLocal(cfg: BrandingConfig) {
    branding.value = {
      logoKey: String(cfg.logoKey || ''),
      logoUrl: resolveLogoUrl(cfg),
      themeColor: cfg.themeColor || DEFAULT_BRANDING.themeColor,
      title: String(cfg.title || '').trim() || DEFAULT_BRANDING.title,
      subtitle: String(cfg.subtitle || '').trim() || DEFAULT_BRANDING.subtitle,
    }
    applyBrandThemeToDocument(branding.value.themeColor)
    if (typeof document !== 'undefined') {
      const hero = [branding.value.title, branding.value.subtitle]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .join(' ')
      if (hero) document.title = hero
    }
  }

  async function load() {
    if (loading.value) return
    loading.value = true
    try {
      const { data } = await fetchPublicBrandingApi()
      applyLocal(data || DEFAULT_BRANDING)
      loaded.value = true
    } catch {
      applyLocal(DEFAULT_BRANDING)
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  function patchFromSettings(cfg: BrandingConfig) {
    applyLocal(cfg)
    loaded.value = true
  }

  return {
    branding,
    loaded,
    loading,
    logoUrl,
    title,
    subtitle,
    loginHeroTitle,
    logoFrameless,
    themeColor,
    load,
    patchFromSettings,
    applyLocal,
  }
})
