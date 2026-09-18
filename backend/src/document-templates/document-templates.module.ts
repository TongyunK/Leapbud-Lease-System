import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { DocumentTemplatesController } from './document-templates.controller';
import { AgreementPreviewPublicController } from './agreement-preview.controller';
import { DocumentTemplatesService } from './document-templates.service';
import { AgreementPrintService } from './agreement-print.service';

@Module({
  imports: [AuthModule],
  controllers: [DocumentTemplatesController, AgreementPreviewPublicController],
  providers: [
    DocumentTemplatesService,
    AgreementPrintService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [DocumentTemplatesService, AgreementPrintService],
})
export class DocumentTemplatesModule {}
