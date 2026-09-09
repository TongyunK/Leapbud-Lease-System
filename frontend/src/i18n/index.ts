import { createI18n } from 'vue-i18n'
import zhTW from './locales/zh-TW'
import en from './locales/en'

export const LOCALE_KEY = 'lb_locale'
export type AppLocale = 'zh-TW' | 'en'

const SUPPORTED: AppLocale[] = ['zh-TW', 'en']

export const localeOptions: { value: AppLocale; labelKey: string }[] = [
  { value: 'zh-TW', labelKey: 'language.zhTW' },
  { value: 'en', labelKey: 'language.en' },
]

function resolveInitialLocale(): AppLocale {
  const saved = localStorage.getItem(LOCALE_KEY)
  // 旧版简体偏好迁移为繁体
  if (saved === 'zh-CN') {
    localStorage.setItem(LOCALE_KEY, 'zh-TW')
    return 'zh-TW'
  }
  if (saved && SUPPORTED.includes(saved as AppLocale)) {
    return saved as AppLocale
  }
  return 'zh-TW'
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: 'zh-TW',
  messages: {
    'zh-TW': zhTW,
    en,
  },
})

export function setLocale(locale: AppLocale) {
  i18n.global.locale.value = locale
  localStorage.setItem(LOCALE_KEY, locale)
  document.documentElement.lang = locale
}
