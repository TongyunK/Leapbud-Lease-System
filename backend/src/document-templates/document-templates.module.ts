import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { DocumentTemplatesController } from './document-templates.controller';
import { AgreementPreviewPublicController } from './agreement-preview.controller';
import { InvoicePreviewPublicController } from './invoice-preview.controller';
import { DocumentTemplatesService } from './document-templates.service';
import { AgreementPrintService } from './agreement-print.service';
import { InvoicePrintService } from './invoice-print.service';

@Module({
  imports: [AuthModule],
  controllers: [
    DocumentTemplatesController,
    AgreementPreviewPublicController,
    InvoicePreviewPublicController,
  ],
  providers: [
    DocumentTemplatesService,
    AgreementPrintService,
    InvoicePrintService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [DocumentTemplatesService, AgreementPrintService, InvoicePrintService],
})
export class DocumentTemplatesModule {}
