import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ElMessageBox } from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import { i18n, LOCALE_KEY } from './i18n'
import './style.css'

document.documentElement.lang = localStorage.getItem(LOCALE_KEY) || 'zh-TW'

/** MessageBox 默认居中 + 可拖动 + 品牌样式（与 el-dialog 全局配置一致） */
function withDialogDefaults<T extends (...args: any[]) => any>(fn: T): T {
  return ((message: unknown, title?: unknown, options?: Record<string, unknown>) => {
    const incoming =
      typeof title === 'object' && title !== null
        ? { ...(title as Record<string, unknown>) }
        : { ...(options || {}) }

    const isDanger = incoming.type === 'warning' || incoming.type === 'error'
    const customClass = ['lb-message-box', isDanger ? 'lb-message-box--danger' : '', incoming.customClass]
      .filter(Boolean)
      .join(' ')

    const defaults: Record<string, unknown> = {
      center: true,
      draggable: true,
      overflow: true,
      customClass,
      confirmButtonText: isDanger
        ? i18n.global.t('common.delete')
        : i18n.global.t('common.confirm'),
      cancelButtonText: i18n.global.t('common.cancel'),
      confirmButtonClass: isDanger
        ? 'lb-message-box__confirm lb-message-box__confirm--danger'
        : 'lb-message-box__confirm',
      cancelButtonClass: 'lb-message-box__cancel',
    }

    const merged = { ...defaults, ...incoming, customClass }

    if (typeof title === 'object' && title !== null) {
      return fn(message, merged)
    }
    return fn(message, title, merged)
  }) as T
}

ElMessageBox.confirm = withDialogDefaults(ElMessageBox.confirm.bind(ElMessageBox))
ElMessageBox.alert = withDialogDefaults(ElMessageBox.alert.bind(ElMessageBox))
ElMessageBox.prompt = withDialogDefaults(ElMessageBox.prompt.bind(ElMessageBox))

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)

app.mount('#app')
