import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DepositRefundsController } from './deposit-refunds.controller'
import { DepositRefundsService } from './deposit-refunds.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'

@Module({
  imports: [AuthModule],
  controllers: [DepositRefundsController],
  providers: [DepositRefundsService, JwtAuthGuard, RolesGuard],
  exports: [DepositRefundsService],
})
export class DepositRefundsModule {}
