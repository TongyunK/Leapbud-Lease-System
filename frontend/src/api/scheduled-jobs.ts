import request from './request'
import type {
  ScheduledJobHandlerOption,
  ScheduledJobLogRecord,
  ScheduledJobRecord,
  UpdateScheduledJobPayload,
} from '@/types/scheduled-job'

export function fetchScheduledJobs(params?: { scheduleKind?: string }) {
  const query: Record<string, string> = {}
  if (params?.scheduleKind) query.scheduleKind = params.scheduleKind
  return request.get<ScheduledJobRecord[]>('/scheduled-jobs', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchScheduledJobHandlers() {
  return request.get<ScheduledJobHandlerOption[]>('/scheduled-jobs/handlers')
}

export function fetchScheduledJob(id: string) {
  return request.get<ScheduledJobRecord>(`/scheduled-jobs/${id}`)
}

export function updateScheduledJobApi(id: string, payload: UpdateScheduledJobPayload) {
  return request.patch<ScheduledJobRecord>(`/scheduled-jobs/${id}`, payload)
}

export function runScheduledJobApi(id: string) {
  return request.post<ScheduledJobRecord>(`/scheduled-jobs/${id}/run`)
}

export function fetchScheduledJobLogs(id: string, limit = 50) {
  return request.get<ScheduledJobLogRecord[]>(`/scheduled-jobs/${id}/logs`, {
    params: { limit },
  })
}
