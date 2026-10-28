import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ScheduledJobsService } from './scheduled-jobs.service'

/**
 * 每分钟检查启用中的周期任务是否到达 HK 执行时刻。
 */
@Injectable()
export class ScheduledJobsRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledJobsRunner.name)
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly jobs: ScheduledJobsService) {}

  onModuleInit() {
    setTimeout(() => {
      void this.jobs.ensureNextRunTimes().catch((e) =>
        this.logger.warn(`ensureNextRunTimes: ${e instanceof Error ? e.message : String(e)}`),
      )
      void this.jobs.tickAuto()
    }, 20_000)
    this.timer = setInterval(() => void this.jobs.tickAuto(), 60 * 1000)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
