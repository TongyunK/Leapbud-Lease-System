import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { PermissionsGuard } from '../permissions/permissions.guard'
import { RequirePermissions } from '../permissions/require-permissions.decorator'
import { CurrentUser, actorUserId } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/jwt-auth.guard'
import { ScheduledJobsService } from './scheduled-jobs.service'
import { UpdateScheduledJobDto } from './dto/scheduled-job.dto'

@ApiTags('scheduled-jobs')
@Controller('scheduled-jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class ScheduledJobsController {
  constructor(private readonly service: ScheduledJobsService) {}

  @Get('handlers')
  @ApiOkResponse({ description: 'Available job handlers' })
  handlers() {
    return this.service.listHandlers()
  }

  @Get()
  @ApiQuery({ name: 'scheduleKind', required: false, description: 'recurring | once' })
  @ApiOkResponse({ description: 'Scheduled jobs' })
  findAll(@Query('scheduleKind') scheduleKind?: string) {
    return this.service.findAll(scheduleKind)
  }

  @Get(':id/logs')
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ description: 'Job run logs' })
  logs(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.service.listLogs(id, limit ? Number(limit) : 50)
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Scheduled job detail' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  @RequirePermissions('scheduledJobs:update')
  @ApiOkResponse({ description: 'Update scheduled job' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateScheduledJobDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.service.update(id, dto, actorUserId(user))
  }

  @Post(':id/run')
  @RequirePermissions('scheduledJobs:update')
  @ApiOkResponse({ description: 'Run job now' })
  run(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    return this.service.runJob(id, 'manual', actorUserId(user))
  }
}
