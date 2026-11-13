import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getApiBaseUrl } from '@/utils/apiConfig'
import { useUserStore } from '@/stores/user'
import { BUILDING_SCOPE_KEY } from '@/stores/buildingScope'
import { useStatusStore } from '@/stores/status'
import router from '@/router'

const BUILDING_SCOPED_PREFIXES = [
  '/rooms',
  '/contracts',
  '/invoices',
  '/invoice-service-details',
  '/deposit-refunds',
  '/contract-settlements',
  '/refund-orders',
  '/cash-flows',
  '/customers',
  '/customer-requirements',
  '/occupants',
  '/receivables',
  '/receipts',
  '/contract-periods',
  '/contract-loan-items',
  '/deposit-deductions',
]

export interface ApiErrorBody {
  message?: string | string[]
}

const request = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
})

request.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const userStore = useUserStore()
  if (userStore.token) {
    config.headers.Authorization = `Bearer ${userStore.token}`
  }
  const method = (config.method || 'get').toLowerCase()
  const path = (config.url || '').split('?')[0] || ''
  const scoped = BUILDING_SCOPED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  if (method === 'get' && scoped) {
    const buildingId = localStorage.getItem(BUILDING_SCOPE_KEY)
    if (buildingId) {
      const params = (config.params ?? {}) as Record<string, unknown>
      if (!params.buildingId && !params.buildingIds) {
        config.params = { ...params, buildingId }
      }
    }
  }
  return config
})

request.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const config = error.config
    const status = error.response?.status
    const raw = error.response?.data?.message
    const message = Array.isArray(raw) ? raw.join('; ') : raw || error.message || 'Request failed'

    if (status === 401) {
      const userStore = useUserStore()
      userStore.logout()
      if (router.currentRoute.value.name !== 'login') {
        router.replace({ name: 'login' })
      }
      // 退出登录或会话失效后，后续无 token 请求会返回 Missing token；静默跳转即可，勿弹技术性提示
      return Promise.reject(error)
    }

    if (!config?.silentError) {
      const statusStore = useStatusStore()
      statusStore.showError(message)
    }

    return Promise.reject(error)
  },
)

export default request
