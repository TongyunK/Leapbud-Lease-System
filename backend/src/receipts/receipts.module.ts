import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ReceiptsController } from './receipts.controller'
import { ReceiptsService } from './receipts.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'

@Module({
  imports: [AuthModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, JwtAuthGuard, RolesGuard],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
