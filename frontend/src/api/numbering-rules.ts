import request from './request'
import type { NumberingBizKey, NumberingResetCycle, NumberingRule } from '@/types/numbering-rule'

export function fetchNumberingRules(params?: { activeOnly?: boolean }) {
  const query: Record<string, string> = {}
  if (params?.activeOnly !== undefined) query.activeOnly = String(params.activeOnly)
  return request.get<NumberingRule[]>('/numbering-rules', { params: query })
}

export function createNumberingRuleApi(payload: {
  name: string
  format: string
  bizKey?: NumberingBizKey | null
  startValue?: number
  resetCycle?: NumberingResetCycle
  sortOrder?: number
  active?: boolean
}) {
  return request.post<NumberingRule>('/numbering-rules', payload)
}

export function updateNumberingRuleApi(
  id: string,
  payload: {
    name?: string
    format?: string
    bizKey?: NumberingBizKey | null
    startValue?: number
    currentSeq?: number
    resetCycle?: NumberingResetCycle
    sortOrder?: number
    active?: boolean
  },
) {
  return request.patch<NumberingRule>(`/numbering-rules/${id}`, payload)
}

export function deleteNumberingRuleApi(id: string) {
  return request.delete<{ success: boolean }>(`/numbering-rules/${id}`)
}

export function batchDeleteNumberingRulesApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/numbering-rules/batch-delete',
    { ids },
  )
}

export function resetNumberingRuleApi(id: string) {
  return request.post<NumberingRule>(`/numbering-rules/${id}/reset`)
}
