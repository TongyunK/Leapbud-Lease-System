import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { WhatsappBusinessNumbersController } from './whatsapp-business-numbers.controller'
import { WhatsappBusinessNumbersService } from './whatsapp-business-numbers.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'

@Module({
  imports: [AuthModule],
  controllers: [WhatsappBusinessNumbersController],
  providers: [WhatsappBusinessNumbersService, JwtAuthGuard, RolesGuard],
  exports: [WhatsappBusinessNumbersService],
})
export class WhatsappBusinessNumbersModule {}
