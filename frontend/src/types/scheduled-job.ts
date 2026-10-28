export type ScheduledJobRecurrence =
  | 'daily'
  | 'weekly'
  | 'monthly_days'
  | 'monthly_weekday'
  | 'yearly'

export type ScheduledJobScheduleKind = 'recurring' | 'once'

export type ScheduledJobRecord = {
  id: string
  code: string
  name: string
  handlerKey: string
  handlerLabel: string
  handlerDescription: string
  enabled: boolean
  scheduleKind: ScheduledJobScheduleKind | string
  recurrence: ScheduledJobRecurrence | string
  runTime: string
  recurrenceConfig: string
  onceAt: string | null
  lastRunAt: string | null
  lastRunAtDisplay: string | null
  lastRunStatus: string
  lastRunMessage: string
  nextRunAt: string | null
  nextRunAtDisplay: string | null
  sortOrder: number
  remark: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export type ScheduledJobHandlerOption = {
  key: string
  label: string
  description: string
}

export type ScheduledJobLogRecord = {
  id: string
  jobId: string
  trigger: string
  startedAt: string
  startedAtDisplay: string | null
  finishedAt: string | null
  finishedAtDisplay: string | null
  status: string
  message: string
}

export type UpdateScheduledJobPayload = {
  name?: string
  enabled?: boolean
  recurrence?: string
  runTime?: string
  recurrenceConfig?: string
  remark?: string
}
