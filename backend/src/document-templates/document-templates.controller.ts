import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import { BatchDeleteDto } from '../common/batch-delete';
import { DocumentTemplatesService } from './document-templates.service';
import { AgreementPrintService } from './agreement-print.service';
import { InvoicePrintService } from './invoice-print.service';
import { ReceiptPrintService } from './receipt-print.service';
import { getFieldDictionary } from './field-dictionary';
import { buildAgreementSampleDocx } from './sample-agreement-docx.util';
import { buildInvoiceSampleDocx } from './sample-invoice-docx.util';
import { buildReceiptSampleDocx } from './sample-receipt-docx.util';
import { createPdfPreviewTicket } from './pdf-preview-ticket.util';
import {
  CreateDocumentTemplateDto,
  PrintAgreementDto,
  PrintInvoiceDto,
  PrintReceiptDto,
  UpdateDocumentTemplateDto,
} from './dto/document-template.dto';

function attachmentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function inlineDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(fileName);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

@ApiTags('document-templates')
@Controller('document-templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class DocumentTemplatesController {
  constructor(
    private readonly documentTemplatesService: DocumentTemplatesService,
    private readonly agreementPrintService: AgreementPrintService,
    private readonly invoicePrintService: InvoicePrintService,
    private readonly receiptPrintService: ReceiptPrintService,
  ) {}

  @Get()
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'enabledOnly', required: false })
  @ApiOkResponse({ description: '单据模板列表' })
  findAll(
    @Query('type') type?: string,
    @Query('enabledOnly') enabledOnly?: string,
  ) {
    const onlyEnabled =
      enabledOnly === undefined ? false : enabledOnly !== 'false' && enabledOnly !== '0';
    return this.documentTemplatesService.findAll({
      type,
      enabledOnly: onlyEnabled,
    });
  }

  @Get('field-dictionary')
  @ApiQuery({ name: 'type', required: true, example: 'agreement' })
  @ApiOkResponse({ description: '模板字段说明（键名 / 中文 / 是否循环）' })
  fieldDictionary(@Query('type') type?: string) {
    const t = (type || '').trim();
    if (!t) throw new BadRequestException('type is required');
    return getFieldDictionary(t);
  }

  @Get('samples/agreement')
  @ApiOkResponse({ description: '下载协议样例 docx（含占位符，可改版后上传）' })
  sampleAgreement(@Res({ passthrough: true }) res: Response) {
    const buffer = buildAgreementSampleDocx();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': attachmentDisposition('agreement-sample.docx'),
    });
    return new StreamableFile(buffer);
  }

  @Get('samples/invoice')
  @ApiOkResponse({ description: '下载发票样例 docx（旧系统键名占位符，可改版后上传）' })
  sampleInvoice(@Res({ passthrough: true }) res: Response) {
    const buffer = buildInvoiceSampleDocx();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': attachmentDisposition('invoice-sample.docx'),
    });
    return new StreamableFile(buffer);
  }

  @Get('samples/receipt')
  @ApiOkResponse({ description: '下载收据样例 docx（旧系统键名占位符，可改版后上传）' })
  sampleReceipt(@Res({ passthrough: true }) res: Response) {
    const buffer = buildReceiptSampleDocx();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': attachmentDisposition('receipt-sample.docx'),
    });
    return new StreamableFile(buffer);
  }

  @Post('prints/agreement')
  @ApiOkResponse({ description: '按合约填充协议模板并下载（docx 或 pdf）' })
  async printAgreement(
    @Body() dto: PrintAgreementDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.agreementPrintService.print({
      contractId: dto.contractId,
      format: dto.format,
      draft: dto.draft,
    });
    res.set({
      'Content-Type': result.contentType,
      // PDF 用 inline 便于浏览器新页预览/列印；docx 仍附件下载
      'Content-Disposition': result.contentType.includes('pdf')
        ? inlineDisposition(result.fileName)
        : attachmentDisposition(result.fileName),
    });
    return new StreamableFile(result.buffer);
  }

  @Post('prints/agreement/preview-ticket')
  @ApiOkResponse({
    description: '生成协议 PDF 预览票据；前端用 /view/:ticket 打开以保留正确文件名',
  })
  async createAgreementPreviewTicket(@Body() dto: PrintAgreementDto) {
    const result = await this.agreementPrintService.print({
      contractId: dto.contractId,
      format: 'pdf',
      draft: dto.draft,
    });
    if (result.format !== 'pdf') {
      throw new BadRequestException(
        '未能生成 PDF（请确认服务器已安装 LibreOffice）。可改用导出 Word。',
      );
    }
    const ticket = createPdfPreviewTicket({
      buffer: result.buffer,
      fileName: result.fileName,
      contentType: result.contentType,
    });
    return { ticket, fileName: result.fileName };
  }

  @Post('prints/invoice')
  @ApiOkResponse({ description: '按发票填充发票模板并下载（docx 或 pdf）' })
  async printInvoice(
    @Body() dto: PrintInvoiceDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.invoicePrintService.print({
      invoiceId: dto.invoiceId,
      draft: dto.draft,
      format: dto.format,
    });
    res.set({
      'Content-Type': result.contentType,
      'Content-Disposition': result.contentType.includes('pdf')
        ? inlineDisposition(result.fileName)
        : attachmentDisposition(result.fileName),
    });
    return new StreamableFile(result.buffer);
  }

  @Post('prints/invoice/preview-ticket')
  @ApiOkResponse({
    description:
      '生成发票 PDF 预览票据；可带 draft（新增／编辑未保存表单）；前端用 /view/:ticket 打开以保留正确文件名',
  })
  async createInvoicePreviewTicket(@Body() dto: PrintInvoiceDto) {
    const result = await this.invoicePrintService.print({
      invoiceId: dto.invoiceId,
      draft: dto.draft,
      format: 'pdf',
    });
    if (result.format !== 'pdf') {
      throw new BadRequestException(
        '未能生成 PDF（请确认服务器已安装 LibreOffice）。可改用导出 Word。',
      );
    }
    const ticket = createPdfPreviewTicket({
      buffer: result.buffer,
      fileName: result.fileName,
      contentType: result.contentType,
    });
    return { ticket, fileName: result.fileName };
  }

  @Post('prints/receipt')
  @ApiOkResponse({ description: '按收据填充收据模板并下载（docx 或 pdf）' })
  async printReceipt(
    @Body() dto: PrintReceiptDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.receiptPrintService.print({
      receiptId: dto.receiptId,
      format: dto.format,
    });
    res.set({
      'Content-Type': result.contentType,
      'Content-Disposition': result.contentType.includes('pdf')
        ? inlineDisposition(result.fileName)
        : attachmentDisposition(result.fileName),
    });
    return new StreamableFile(result.buffer);
  }

  @Post('prints/receipt/preview-ticket')
  @ApiOkResponse({
    description: '生成收据 PDF 预览票据；前端用 /view/:ticket 打开以保留正确文件名',
  })
  async createReceiptPreviewTicket(@Body() dto: PrintReceiptDto) {
    const result = await this.receiptPrintService.print({
      receiptId: dto.receiptId,
      format: 'pdf',
    });
    if (result.format !== 'pdf') {
      throw new BadRequestException(
        '未能生成 PDF（请确认服务器已安装 LibreOffice）。可改用导出 Word。',
      );
    }
    const ticket = createPdfPreviewTicket({
      buffer: result.buffer,
      fileName: result.fileName,
      contentType: result.contentType,
    });
    return { ticket, fileName: result.fileName };
  }

  @RequirePermissions('documentTemplates:batchDelete')
  @Post('batch-delete')
  @ApiOkResponse({ description: '批量删除模板' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.documentTemplatesService.removeMany(dto.ids);
  }

  @Get(':id/download')
  @ApiOkResponse({ description: '下载原始 docx 模板' })
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.documentTemplatesService.getFile(id);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': attachmentDisposition(file.fileName),
    });
    return new StreamableFile(file.buffer);
  }

  @Get(':id/preview')
  @ApiOkResponse({ description: '浏览器预览模板（返回原始 docx，由前端渲染）' })
  async preview(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.documentTemplatesService.previewFile(id);
    res.set({
      'Content-Type': result.contentType,
      'Content-Disposition': inlineDisposition(result.fileName),
    });
    return new StreamableFile(result.buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentTemplatesService.findOne(id);
  }

  @RequirePermissions('documentTemplates:create')
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'name', 'type'],
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['agreement', 'invoice', 'receipt'] },
        enabled: { type: 'boolean' },
        remark: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateDocumentTemplateDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.documentTemplatesService.create(dto, file, actorUserId(user));
  }

  @RequirePermissions('documentTemplates:update')
  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['agreement', 'invoice', 'receipt'] },
        enabled: { type: 'boolean' },
        remark: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UpdateDocumentTemplateDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.documentTemplatesService.update(id, dto, file, actorUserId(user));
  }

  @RequirePermissions('documentTemplates:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentTemplatesService.remove(id);
  }
}
