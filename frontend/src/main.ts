import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ElMessageBox } from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import { i18n, LOCALE_KEY } from './i18n'
import './style.css'

document.documentElement.lang = localStorage.getItem(LOCALE_KEY) || 'zh-TW'

/** MessageBox 默认居中 + 可拖动（与 el-dialog 全局配置一致） */
function withDialogDefaults<T extends (...args: any[]) => any>(fn: T): T {
  return ((message: unknown, title?: unknown, options?: Record<string, unknown>) => {
    const defaults = { center: true, draggable: true, overflow: true }
    if (typeof title === 'object' && title !== null) {
      return fn(message, { ...defaults, ...title })
    }
    return fn(message, title, { ...defaults, ...(options || {}) })
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
