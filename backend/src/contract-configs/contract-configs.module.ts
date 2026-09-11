import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContractConfigsController } from './contract-configs.controller';
import { ContractConfigsService } from './contract-configs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [ContractConfigsController],
  providers: [ContractConfigsService, JwtAuthGuard, RolesGuard],
  exports: [ContractConfigsService],
})
export class ContractConfigsModule {}
