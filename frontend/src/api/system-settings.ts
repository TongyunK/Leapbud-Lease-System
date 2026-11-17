import request from './request'
import type {
  BrandingConfig,
  SystemSettings,
  UpdateBrandingPayload,
  UpdateContractExpiringSoonPayload,
  UpdateMailSmtpPayload,
  UpdateSystemSettingsPayload,
} from '@/types/system-setting'

export function fetchSystemSettings() {
  return request.get<SystemSettings>('/system-settings')
}

/** 公开：登录页／侧栏品牌（无需登录） */
export function fetchPublicBrandingApi() {
  return request.get<BrandingConfig>('/system-settings/branding', { silentError: true })
}

export function updateSystemSettingsApi(payload: UpdateSystemSettingsPayload) {
  return request.put<SystemSettings>('/system-settings', payload)
}

/** SuperAdmin：更新合約「即將到期」篩選條件 */
export function updateContractExpiringSoonApi(payload: UpdateContractExpiringSoonPayload) {
  return request.put<SystemSettings>('/system-settings/contract-expiring-soon', payload)
}

export function updateMailSmtpApi(payload: UpdateMailSmtpPayload) {
  return request.put<SystemSettings>('/system-settings/mail-smtp', payload)
}

export function updateBrandingApi(payload: UpdateBrandingPayload) {
  return request.put<SystemSettings>('/system-settings/branding', payload)
}
