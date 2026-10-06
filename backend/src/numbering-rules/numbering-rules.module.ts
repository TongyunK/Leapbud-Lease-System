import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NumberingRulesController } from './numbering-rules.controller';
import { NumberingRulesService } from './numbering-rules.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [NumberingRulesController],
  providers: [NumberingRulesService, JwtAuthGuard, RolesGuard],
  exports: [NumberingRulesService],
})
export class NumberingRulesModule {}
