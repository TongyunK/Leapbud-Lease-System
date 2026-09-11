import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LeaseTerminationsController } from './lease-terminations.controller';
import { LeaseTerminationsService } from './lease-terminations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [LeaseTerminationsController],
  providers: [LeaseTerminationsService, JwtAuthGuard, RolesGuard],
  exports: [LeaseTerminationsService],
})
export class LeaseTerminationsModule {}
