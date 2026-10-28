import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { auditActorLabel, auditUserSelect, type AuditUserRef } from '../common/audit'
import {
  HANDLER_RENT_INVOICE_DUE,
  SCHEDULED_JOB_HANDLER_META,
  type ScheduledJobHandler,
  type ScheduledJobHandlerResult,
} from './scheduled-job.handlers'
import { UpdateScheduledJobDto } from './dto/scheduled-job.dto'
import {
  formatHkDateTime,
  matchesScheduleNow,
  nextRecurringRunAt,
  parseRunTime,
} from './schedule-time'
import { InvoiceAutoService } from '../invoices/invoice-auto.service'

@Injectable()
export class ScheduledJobsService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledJobsService.name)
  private readonly handlers = new Map<string, ScheduledJobHandler>()
  /** 防同分钟重复触发：jobId -> ymdHm */
  private readonly firedKeys = new Map<string, string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceAuto: InvoiceAutoService,
  ) {}

  onModuleInit() {
    this.handlers.set(HANDLER_RENT_INVOICE_DUE, async () => {
      const { created, blockedSigning } = await this.invoiceAuto.runDueRentInvoices()
      return {
        message: `開立 ${created} 張租金發票；簽約中攔截 ${blockedSigning}`,
      }
    })
  }

  listHandlers() {
    return Object.entries(SCHEDULED_JOB_HANDLER_META).map(([key, meta]) => ({
      key,
      label: meta.labelZh,
      description: meta.descriptionZh,
    }))
  }

  private toDto(row: {
    id: string
    code: string
    name: string
    handlerKey: string
    enabled: boolean
    scheduleKind: string
    recurrence: string
    runTime: string
    recurrenceConfig: string
    onceAt: Date | null
    lastRunAt: Date | null
    lastRunStatus: string
    lastRunMessage: string
    nextRunAt: Date | null
    sortOrder: number
    remark: string
    createdAt: Date
    updatedAt: Date
    createdByUser?: AuditUserRef | null
    updatedByUser?: AuditUserRef | null
  }) {
    const meta = SCHEDULED_JOB_HANDLER_META[row.handlerKey]
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      handlerKey: row.handlerKey,
      handlerLabel: meta?.labelZh || row.handlerKey,
      handlerDescription: meta?.descriptionZh || '',
      enabled: row.enabled,
      scheduleKind: row.scheduleKind,
      recurrence: row.recurrence,
      runTime: row.runTime,
      recurrenceConfig: row.recurrenceConfig,
      onceAt: row.onceAt ? row.onceAt.toISOString() : null,
      lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
      lastRunAtDisplay: formatHkDateTime(row.lastRunAt),
      lastRunStatus: row.lastRunStatus,
      lastRunMessage: row.lastRunMessage,
      nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
      nextRunAtDisplay: formatHkDateTime(row.nextRunAt),
      sortOrder: row.sortOrder,
      remark: row.remark,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: auditActorLabel(row.createdByUser),
      updatedBy: auditActorLabel(row.updatedByUser),
    }
  }

  async ensureNextRunTimes() {
    const rows = await this.prisma.scheduledJob.findMany({
      where: { scheduleKind: 'recurring', enabled: true },
      select: {
        id: true,
        recurrence: true,
        runTime: true,
        recurrenceConfig: true,
        nextRunAt: true,
      },
    })
    const now = new Date()
    for (const row of rows) {
      const next = nextRecurringRunAt(row.recurrence, row.runTime, row.recurrenceConfig, now)
      if (!row.nextRunAt || Math.abs(row.nextRunAt.getTime() - next.getTime()) > 1000) {
        await this.prisma.scheduledJob.update({
          where: { id: row.id },
          data: { nextRunAt: next },
        })
      }
    }
  }

  async findAll(scheduleKind?: string) {
    await this.ensureNextRunTimes()
    const kind = (scheduleKind || '').trim()
    const rows = await this.prisma.scheduledJob.findMany({
      where: kind ? { scheduleKind: kind } : undefined,
      include: {
        createdByUser: { select: auditUserSelect },
        updatedByUser: { select: auditUserSelect },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    return rows.map((r) => this.toDto(r))
  }

  async findOne(id: string) {
    const row = await this.prisma.scheduledJob.findUnique({
      where: { id },
      include: {
        createdByUser: { select: auditUserSelect },
        updatedByUser: { select: auditUserSelect },
      },
    })
    if (!row) throw new NotFoundException(`Scheduled job ${id} not found`)
    return this.toDto(row)
  }

  async update(id: string, dto: UpdateScheduledJobDto, actorId?: string | null) {
    const existing = await this.prisma.scheduledJob.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException(`Scheduled job ${id} not found`)

    if (dto.runTime != null) {
      parseRunTime(dto.runTime)
    }

    const runTime = dto.runTime ?? existing.runTime
    const recurrence = dto.recurrence ?? existing.recurrence
    const recurrenceConfig =
      dto.recurrenceConfig !== undefined ? dto.recurrenceConfig : existing.recurrenceConfig
    const enabled = dto.enabled ?? existing.enabled
    const nextRunAt =
      existing.scheduleKind === 'recurring' && enabled
        ? nextRecurringRunAt(recurrence, runTime, recurrenceConfig)
        : enabled
          ? existing.nextRunAt
          : null

    const row = await this.prisma.scheduledJob.update({
      where: { id },
      data: {
        name: dto.name?.trim() || undefined,
        enabled: dto.enabled,
        recurrence: dto.recurrence,
        runTime: dto.runTime,
        recurrenceConfig: dto.recurrenceConfig,
        remark: dto.remark,
        nextRunAt,
        updatedById: actorId || null,
      },
      include: {
        createdByUser: { select: auditUserSelect },
        updatedByUser: { select: auditUserSelect },
      },
    })
    return this.toDto(row)
  }

  async setEnabled(id: string, enabled: boolean, actorId?: string | null) {
    return this.update(id, { enabled }, actorId)
  }

  async listLogs(jobId: string, limit = 50) {
    await this.findOne(jobId)
    const take = Math.min(200, Math.max(1, Math.floor(limit) || 50))
    const rows = await this.prisma.scheduledJobLog.findMany({
      where: { jobId },
      orderBy: { startedAt: 'desc' },
      take,
    })
    return rows.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      trigger: r.trigger,
      startedAt: r.startedAt.toISOString(),
      startedAtDisplay: formatHkDateTime(r.startedAt),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      finishedAtDisplay: formatHkDateTime(r.finishedAt),
      status: r.status,
      message: r.message,
    }))
  }

  async runJob(id: string, trigger: 'auto' | 'manual' = 'manual', actorId?: string | null) {
    const job = await this.prisma.scheduledJob.findUnique({ where: { id } })
    if (!job) throw new NotFoundException(`Scheduled job ${id} not found`)

    const handler = this.handlers.get(job.handlerKey)
    if (!handler) {
      throw new BadRequestException(`No handler registered for ${job.handlerKey}`)
    }

    const startedAt = new Date()
    const log = await this.prisma.scheduledJobLog.create({
      data: {
        jobId: job.id,
        trigger,
        startedAt,
        status: 'running',
        message: '',
      },
    })

    let status = 'success'
    let message = ''
    try {
      const result: ScheduledJobHandlerResult = await handler()
      message = (result.message || 'OK').slice(0, 2000)
    } catch (e) {
      status = 'failed'
      message = (e instanceof Error ? e.message : String(e)).slice(0, 2000)
      this.logger.error(`Job ${job.code} failed: ${message}`)
    }

    const finishedAt = new Date()
    await this.prisma.$transaction([
      this.prisma.scheduledJobLog.update({
        where: { id: log.id },
        data: { finishedAt, status, message },
      }),
      this.prisma.scheduledJob.update({
        where: { id: job.id },
        data: {
          lastRunAt: finishedAt,
          lastRunStatus: status,
          lastRunMessage: message,
          nextRunAt:
            job.scheduleKind === 'recurring' && job.enabled
              ? nextRecurringRunAt(job.recurrence, job.runTime, job.recurrenceConfig, finishedAt)
              : job.nextRunAt,
          updatedById: actorId || undefined,
        },
      }),
    ])

    return this.findOne(id)
  }

  /** 每分钟由 runner 调用 */
  async tickAuto(now = new Date()) {
    const jobs = await this.prisma.scheduledJob.findMany({
      where: { enabled: true, scheduleKind: 'recurring' },
    })
    for (const job of jobs) {
      if (!matchesScheduleNow(job.recurrence, job.runTime, job.recurrenceConfig, now)) continue
      const p = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(now)
      const get = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value || ''
      const key = `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}`
      if (this.firedKeys.get(job.id) === key) continue
      this.firedKeys.set(job.id, key)
      try {
        await this.runJob(job.id, 'auto', null)
      } catch (e) {
        this.logger.error(
          `Auto tick job ${job.code}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
  }
}
