import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContractConfigsModule } from '../contract-configs/contract-configs.module';
import { ContractPeriodsController } from './contract-periods.controller';
import { ContractPeriodsService } from './contract-periods.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule, ContractConfigsModule],
  controllers: [ContractPeriodsController],
  providers: [ContractPeriodsService, JwtAuthGuard, RolesGuard],
  exports: [ContractPeriodsService],
})
export class ContractPeriodsModule {}
