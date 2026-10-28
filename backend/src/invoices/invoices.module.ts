import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { NumberingRulesModule } from '../numbering-rules/numbering-rules.module'
import { SystemSettingsModule } from '../system-settings/system-settings.module'
import { InvoicesController } from './invoices.controller'
import { InvoicesService } from './invoices.service'
import { InvoiceAutoService } from './invoice-auto.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'

@Module({
  imports: [AuthModule, NumberingRulesModule, SystemSettingsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceAutoService, JwtAuthGuard, RolesGuard],
  exports: [InvoicesService, InvoiceAutoService],
})
export class InvoicesModule {}
