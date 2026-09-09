import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BuildingsController } from './buildings.controller';
import { BuildingsService } from './buildings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [BuildingsController],
  providers: [BuildingsService, JwtAuthGuard, RolesGuard],
  exports: [BuildingsService],
})
export class BuildingsModule {}
