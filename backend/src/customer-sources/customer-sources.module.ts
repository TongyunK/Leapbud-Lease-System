import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerSourcesController } from './customer-sources.controller';
import { CustomerSourcesService } from './customer-sources.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [CustomerSourcesController],
  providers: [CustomerSourcesService, JwtAuthGuard, RolesGuard],
  exports: [CustomerSourcesService],
})
export class CustomerSourcesModule {}
