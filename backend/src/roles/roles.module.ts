import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [RolesController],
  providers: [RolesService, JwtAuthGuard, RolesGuard],
  exports: [RolesService],
})
export class RolesModule {}
