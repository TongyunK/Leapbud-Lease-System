import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContractConfigsModule } from '../contract-configs/contract-configs.module';
import { NumberingRulesModule } from '../numbering-rules/numbering-rules.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule, ContractConfigsModule, NumberingRulesModule],
  controllers: [ContractsController],
  providers: [ContractsService, JwtAuthGuard, RolesGuard],
  exports: [ContractsService],
})
export class ContractsModule {}
