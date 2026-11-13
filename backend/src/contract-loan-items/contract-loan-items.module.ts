import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContractLoanItemsController } from './contract-loan-items.controller';
import { ContractLoanItemsService } from './contract-loan-items.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [ContractLoanItemsController],
  providers: [ContractLoanItemsService, JwtAuthGuard, RolesGuard],
  exports: [ContractLoanItemsService],
})
export class ContractLoanItemsModule {}
