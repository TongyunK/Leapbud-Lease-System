import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { WhatsappTemplateCategoriesController } from './whatsapp-template-categories.controller'
import { WhatsappTemplateCategoriesService } from './whatsapp-template-categories.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'

@Module({
  imports: [AuthModule],
  controllers: [WhatsappTemplateCategoriesController],
  providers: [WhatsappTemplateCategoriesService, JwtAuthGuard, RolesGuard],
  exports: [WhatsappTemplateCategoriesService],
})
export class WhatsappTemplateCategoriesModule {}
