import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContractConfigsModule } from '../contract-configs/contract-configs.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [
    AuthModule,
    ContractConfigsModule,
    ReceiptsModule,
    InvoicesModule,
    SystemSettingsModule,
  ],
  controllers: [ContractsController],
  providers: [ContractsService, JwtAuthGuard, RolesGuard],
  exports: [ContractsService],
})
export class ContractsModule {}
