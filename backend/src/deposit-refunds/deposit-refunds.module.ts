import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ReceiptsModule } from '../receipts/receipts.module'
import { ContractSettlementsModule } from '../contract-settlements/contract-settlements.module'
import { DepositRefundsController } from './deposit-refunds.controller'
import { DepositRefundsService } from './deposit-refunds.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'

@Module({
  imports: [AuthModule, ReceiptsModule, ContractSettlementsModule],
  controllers: [DepositRefundsController],
  providers: [DepositRefundsService, JwtAuthGuard, RolesGuard],
  exports: [DepositRefundsService],
})
export class DepositRefundsModule {}
