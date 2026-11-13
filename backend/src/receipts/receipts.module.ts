import { Module, forwardRef } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { NumberingRulesModule } from '../numbering-rules/numbering-rules.module'
import { ContractSettlementsModule } from '../contract-settlements/contract-settlements.module'
import { ReceiptsController } from './receipts.controller'
import { ReceiptsService } from './receipts.service'
import { BookingDepositService } from './booking-deposit.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'

@Module({
  imports: [AuthModule, NumberingRulesModule, forwardRef(() => ContractSettlementsModule)],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, BookingDepositService, JwtAuthGuard, RolesGuard],
  exports: [ReceiptsService, BookingDepositService],
})
export class ReceiptsModule {}
