/** 定时任务处理器键（代码注册；库表 handler_key 与此对齐） */
export const HANDLER_RENT_INVOICE_DUE = 'rent_invoice_due'

export type ScheduledJobHandlerResult = {
  message?: string
}

export type ScheduledJobHandler = () => Promise<ScheduledJobHandlerResult>

export const SCHEDULED_JOB_HANDLER_META: Record<
  string,
  { labelZh: string; labelEn: string; descriptionZh: string }
> = {
  [HANDLER_RENT_INVOICE_DUE]: {
    labelZh: '租金自動開票（繳費期前）',
    labelEn: 'Auto rent invoice (lead days)',
    descriptionZh: '為「租賃中」合約開立即將到來的租金發票；提前天數取自系統設置',
  },
}
