import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionsGuard, JwtAuthGuard, RolesGuard],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
