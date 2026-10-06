import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NumberingRulesModule } from '../numbering-rules/numbering-rules.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule, NumberingRulesModule],
  controllers: [CustomersController],
  providers: [CustomersService, JwtAuthGuard, RolesGuard],
  exports: [CustomersService],
})
export class CustomersModule {}
