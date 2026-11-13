import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContractConfigsModule } from '../contract-configs/contract-configs.module';
import { CustomerRequirementsModule } from '../customer-requirements/customer-requirements.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { ContractSettlementsModule } from '../contract-settlements/contract-settlements.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractCancelService } from './contract-cancel.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [
    AuthModule,
    ContractConfigsModule,
    CustomerRequirementsModule,
    ReceiptsModule,
    InvoicesModule,
    SystemSettingsModule,
    ContractSettlementsModule,
  ],
  controllers: [ContractsController],
  providers: [ContractsService, ContractCancelService, JwtAuthGuard, RolesGuard],
  exports: [ContractsService, ContractCancelService],
})
export class ContractsModule {}
