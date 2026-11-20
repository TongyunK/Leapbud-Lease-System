import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { WhatsappTemplatesController } from './whatsapp-templates.controller'
import { WhatsappTemplatesService } from './whatsapp-templates.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'

@Module({
  imports: [AuthModule],
  controllers: [WhatsappTemplatesController],
  providers: [WhatsappTemplatesService, JwtAuthGuard, RolesGuard],
  exports: [WhatsappTemplatesService],
})
export class WhatsappTemplatesModule {}
