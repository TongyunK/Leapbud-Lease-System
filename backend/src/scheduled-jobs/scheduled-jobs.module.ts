import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PermissionsModule } from '../permissions/permissions.module'
import { InvoicesModule } from '../invoices/invoices.module'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { ScheduledJobsController } from './scheduled-jobs.controller'
import { ScheduledJobsService } from './scheduled-jobs.service'
import { ScheduledJobsRunner } from './scheduled-jobs.runner'

@Module({
  imports: [AuthModule, PermissionsModule, InvoicesModule],
  controllers: [ScheduledJobsController],
  providers: [ScheduledJobsService, ScheduledJobsRunner, JwtAuthGuard, RolesGuard],
  exports: [ScheduledJobsService],
})
export class ScheduledJobsModule {}
