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
  UpdateBrandingDto,
  UpdateContractExpiringSoonDto,
  UpdateMailSmtpDto,
  UpdateSystemSettingsDto,
} from './dto/system-setting.dto'

@ApiTags('system-settings')
@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  /** 公开：登录页／侧栏品牌（无鉴权） */
  @Get('branding')
  @ApiOkResponse({ description: 'Public branding (logo / theme / titles)' })
  getBranding() {
    return this.service.getBranding()
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.admin, UserRole.user)
  @RequirePermissions('systemSettings:update')
  @ApiOkResponse({
    description: 'System settings（含 SMTP 明文密码，仅系统设置保存权限可取）',
  })
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

  /** 邮件 SMTP（忘记密码发信等） */
  @Put('mail-smtp')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.admin, UserRole.user)
  @RequirePermissions('systemSettings:update')
  @ApiOkResponse({ description: 'Update mail SMTP settings' })
  updateMailSmtp(@Body() dto: UpdateMailSmtpDto, @CurrentUser() user: JwtPayload) {
    return this.service.updateMailSmtp(dto, actorUserId(user))
  }

  /** 品牌外观：Logo / 主题色 / 公司名称 */
  @Put('branding')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.admin, UserRole.user)
  @RequirePermissions('systemSettings:update')
  @ApiOkResponse({ description: 'Update branding settings' })
  updateBranding(@Body() dto: UpdateBrandingDto, @CurrentUser() user: JwtPayload) {
    return this.service.updateBranding(dto, actorUserId(user))
  }
}
