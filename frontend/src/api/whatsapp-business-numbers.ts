import request from './request'
import type { WhatsappBusinessNumber } from '@/types/whatsapp'

export function fetchWhatsappBusinessNumbers(params?: { activeOnly?: boolean }) {
  const query: Record<string, string> = {}
  if (params?.activeOnly !== undefined) query.activeOnly = String(params.activeOnly)
  return request.get<WhatsappBusinessNumber[]>('/whatsapp-business-numbers', {
    params: query,
    silentError: true,
  })
}

export function createWhatsappBusinessNumberApi(payload: {
  label: string
  phoneNumber: string
  remark?: string
  sortOrder?: number
  active?: boolean
}) {
  return request.post<WhatsappBusinessNumber>('/whatsapp-business-numbers', payload, {
    silentError: true,
  })
}

export function updateWhatsappBusinessNumberApi(
  id: string,
  payload: {
    label?: string
    phoneNumber?: string
    remark?: string
    sortOrder?: number
    active?: boolean
  },
) {
  return request.patch<WhatsappBusinessNumber>(`/whatsapp-business-numbers/${id}`, payload, {
    silentError: true,
  })
}

export function deleteWhatsappBusinessNumberApi(id: string) {
  return request.delete<{ success: boolean }>(`/whatsapp-business-numbers/${id}`, {
    silentError: true,
  })
}

export function reorderWhatsappBusinessNumbersApi(
  items: Array<{ id: string; sortOrder: number }>,
) {
  return request.patch<{ success: boolean }>(
    '/whatsapp-business-numbers/reorder',
    { items },
    { silentError: true },
  )
}
