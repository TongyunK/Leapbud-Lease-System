import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { InvoicesController } from './invoices.controller'
import { InvoicesService } from './invoices.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'

@Module({
  imports: [AuthModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, JwtAuthGuard, RolesGuard],
  exports: [InvoicesService],
})
export class InvoicesModule {}
