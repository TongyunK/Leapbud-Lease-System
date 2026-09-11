import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContractOtherFeesController } from './contract-other-fees.controller';
import { ContractOtherFeesService } from './contract-other-fees.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [ContractOtherFeesController],
  providers: [ContractOtherFeesService, JwtAuthGuard, RolesGuard],
  exports: [ContractOtherFeesService],
})
export class ContractOtherFeesModule {}
