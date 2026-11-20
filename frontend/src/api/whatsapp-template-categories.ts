import request from './request'
import type { WhatsappTemplateCategory } from '@/types/whatsapp'

export function fetchWhatsappTemplateCategories(params?: { activeOnly?: boolean }) {
  const query: Record<string, string> = {}
  if (params?.activeOnly !== undefined) query.activeOnly = String(params.activeOnly)
  return request.get<WhatsappTemplateCategory[]>('/whatsapp-template-categories', {
    params: query,
    silentError: true,
  })
}

export function createWhatsappTemplateCategoryApi(payload: {
  code: string
  label: string
  badgeTone?: string
  remark?: string
  sortOrder?: number
  active?: boolean
}) {
  return request.post<WhatsappTemplateCategory>('/whatsapp-template-categories', payload, {
    silentError: true,
  })
}

export function updateWhatsappTemplateCategoryApi(
  id: string,
  payload: {
    code?: string
    label?: string
    badgeTone?: string
    remark?: string
    sortOrder?: number
    active?: boolean
  },
) {
  return request.patch<WhatsappTemplateCategory>(`/whatsapp-template-categories/${id}`, payload, {
    silentError: true,
  })
}

export function deleteWhatsappTemplateCategoryApi(id: string) {
  return request.delete<{ success: boolean }>(`/whatsapp-template-categories/${id}`, {
    silentError: true,
  })
}

export function reorderWhatsappTemplateCategoriesApi(
  items: Array<{ id: string; sortOrder: number }>,
) {
  return request.patch<{ success: boolean }>(
    '/whatsapp-template-categories/reorder',
    { items },
    { silentError: true },
  )
}
