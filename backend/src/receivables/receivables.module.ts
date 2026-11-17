import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { NumberingRulesModule } from '../numbering-rules/numbering-rules.module'
import { ReceivablesController } from './receivables.controller'
import { ReceivablesService } from './receivables.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'

@Module({
  imports: [AuthModule, NumberingRulesModule],
  controllers: [ReceivablesController],
  providers: [ReceivablesService, JwtAuthGuard, RolesGuard],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
