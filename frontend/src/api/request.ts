import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getApiBaseUrl } from '@/utils/apiConfig'
import { useUserStore } from '@/stores/user'
import { useStatusStore } from '@/stores/status'
import router from '@/router'

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
    }

    if (!config?.silentError) {
      const statusStore = useStatusStore()
      statusStore.showError(message)
    }

    return Promise.reject(error)
  },
)

export default request
