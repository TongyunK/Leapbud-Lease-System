import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PermissionsModule } from '../permissions/permissions.module'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { SystemSettingsController } from './system-settings.controller'
import { SystemSettingsService } from './system-settings.service'

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService, JwtAuthGuard, RolesGuard],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
