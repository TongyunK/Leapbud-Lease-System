import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { SuperAdminGuard } from '../auth/super-admin.guard'
import { PermissionsGuard } from '../permissions/permissions.guard'
import { RequirePermissions } from '../permissions/require-permissions.decorator'
import { CurrentUser, actorUserId } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/jwt-auth.guard'
import { SystemSettingsService } from './system-settings.service'
import {
  UpdateContractExpiringSoonDto,
  UpdateSystemSettingsDto,
} from './dto/system-setting.dto'

@ApiTags('system-settings')
@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.user)
  @ApiOkResponse({ description: 'System settings' })
  get() {
    return this.service.getView()
  }

  @Put()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.admin, UserRole.user)
  @RequirePermissions('systemSettings:update')
  @ApiOkResponse({ description: 'Update billing system settings' })
  update(@Body() dto: UpdateSystemSettingsDto, @CurrentUser() user: JwtPayload) {
    return this.service.update(dto, actorUserId(user))
  }

  /** 合約「即將到期」條件：僅 SuperAdmin 可改 */
  @Put('contract-expiring-soon')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, SuperAdminGuard)
  @Roles(UserRole.admin, UserRole.user)
  @ApiOkResponse({ description: 'Update contract expiring-soon filter config (SuperAdmin)' })
  updateExpiringSoon(
    @Body() dto: UpdateContractExpiringSoonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateContractExpiringSoon(dto, actorUserId(user))
  }
}
