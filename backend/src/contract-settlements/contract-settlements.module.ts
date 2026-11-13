import { Module, forwardRef } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { ReceiptsModule } from '../receipts/receipts.module'
import { InvoicesModule } from '../invoices/invoices.module'
import { CustomerRequirementsModule } from '../customer-requirements/customer-requirements.module'
import { ContractSettlementsController } from './contract-settlements.controller'
import { ContractSettlementsService } from './contract-settlements.service'
import { VacateConductService } from './vacate-conduct.service'
import { DepositDeductionsController } from './deposit-deductions.controller'
import { DepositDeductionsService } from './deposit-deductions.service'
import { CashFlowsService } from './cash-flows.service'
import { CashFlowsQueryService } from './cash-flows-query.service'
import { CashFlowsController } from './cash-flows.controller'
import { ReceivableWriteoffsService } from './receivable-writeoffs.service'
import { ReceivableWriteoffsQueryService } from './receivable-writeoffs-query.service'
import { RefundOrdersService } from './refund-orders.service'
import { RefundOrdersQueryService } from './refund-orders-query.service'
import { RefundOrdersController } from './refund-orders.controller'
import { ContractChangeLogService } from './contract-change-log.service'
import { ContractChangeLogsQueryService } from './contract-change-logs-query.service'

@Module({
  imports: [
    AuthModule,
    forwardRef(() => ReceiptsModule),
    InvoicesModule,
    CustomerRequirementsModule,
  ],
  controllers: [
    ContractSettlementsController,
    DepositDeductionsController,
    RefundOrdersController,
    CashFlowsController,
  ],
  providers: [
    ContractSettlementsService,
    VacateConductService,
    DepositDeductionsService,
    CashFlowsService,
    CashFlowsQueryService,
    ReceivableWriteoffsService,
    ReceivableWriteoffsQueryService,
    RefundOrdersService,
    RefundOrdersQueryService,
    ContractChangeLogService,
    ContractChangeLogsQueryService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    ContractSettlementsService,
    VacateConductService,
    CashFlowsService,
    ReceivableWriteoffsService,
    RefundOrdersService,
    ContractChangeLogService,
  ],
})
export class ContractSettlementsModule {}
