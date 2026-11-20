import request from './request'
import type { WhatsappTemplate } from '@/types/whatsapp'

export function fetchWhatsappTemplates(params?: {
  activeOnly?: boolean
  buildingId?: string
  categoryId?: string
}) {
  const query: Record<string, string> = {}
  if (params?.activeOnly !== undefined) query.activeOnly = String(params.activeOnly)
  if (params?.buildingId) query.buildingId = params.buildingId
  if (params?.categoryId) query.categoryId = params.categoryId
  return request.get<WhatsappTemplate[]>('/whatsapp-templates', {
    params: query,
    silentError: true,
  })
}

export function createWhatsappTemplateApi(payload: {
  buildingIds: string[]
  categoryId: string
  label: string
  templateName: string
  remark?: string
  diagramKey?: string
  sortOrder?: number
  active?: boolean
}) {
  return request.post<WhatsappTemplate>('/whatsapp-templates', payload, {
    silentError: true,
  })
}

export function updateWhatsappTemplateApi(
  id: string,
  payload: {
    buildingIds?: string[]
    categoryId?: string
    label?: string
    templateName?: string
    remark?: string
    diagramKey?: string
    sortOrder?: number
    active?: boolean
  },
) {
  return request.patch<WhatsappTemplate>(`/whatsapp-templates/${id}`, payload, {
    silentError: true,
  })
}

export function deleteWhatsappTemplateApi(id: string) {
  return request.delete<{ success: boolean }>(`/whatsapp-templates/${id}`, {
    silentError: true,
  })
}

export function reorderWhatsappTemplatesApi(items: Array<{ id: string; sortOrder: number }>) {
  return request.patch<{ success: boolean }>(
    '/whatsapp-templates/reorder',
    { items },
    { silentError: true },
  )
}
