import request from './request'
import type {
  SystemSettings,
  UpdateContractExpiringSoonPayload,
  UpdateSystemSettingsPayload,
} from '@/types/system-setting'

export function fetchSystemSettings() {
  return request.get<SystemSettings>('/system-settings')
}

export function updateSystemSettingsApi(payload: UpdateSystemSettingsPayload) {
  return request.put<SystemSettings>('/system-settings', payload)
}

/** SuperAdmin：更新合約「即將到期」篩選條件 */
export function updateContractExpiringSoonApi(payload: UpdateContractExpiringSoonPayload) {
  return request.put<SystemSettings>('/system-settings/contract-expiring-soon', payload)
}
