import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerRequirementsController } from './customer-requirements.controller';
import { CustomerRequirementsService } from './customer-requirements.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [CustomerRequirementsController],
  providers: [CustomerRequirementsService, JwtAuthGuard, RolesGuard],
  exports: [CustomerRequirementsService],
})
export class CustomerRequirementsModule {}
