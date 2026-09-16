import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvoiceServiceDetailsController } from './invoice-service-details.controller';
import { InvoiceServiceDetailsService } from './invoice-service-details.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [InvoiceServiceDetailsController],
  providers: [InvoiceServiceDetailsService, JwtAuthGuard, RolesGuard],
  exports: [InvoiceServiceDetailsService],
})
export class InvoiceServiceDetailsModule {}
