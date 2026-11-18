import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContractConfigsModule } from '../contract-configs/contract-configs.module';
import { CustomerRequirementsModule } from '../customer-requirements/customer-requirements.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { ContractSettlementsModule } from '../contract-settlements/contract-settlements.module';
import { NumberingRulesModule } from '../numbering-rules/numbering-rules.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractCancelService } from './contract-cancel.service';
import { ContractRenewalService } from './contract-renewal.service';
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
    NumberingRulesModule,
  ],
  controllers: [ContractsController],
  providers: [
    ContractsService,
    ContractCancelService,
    ContractRenewalService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [ContractsService, ContractCancelService, ContractRenewalService],
})
export class ContractsModule {}
