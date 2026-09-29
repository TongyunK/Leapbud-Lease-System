import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { getPdfPreviewTicket } from './pdf-preview-ticket.util';

function inlineDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(fileName);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * 无鉴权预览入口：票据本身为不可猜测 UUID，短时有效。
 */
@ApiTags('document-templates')
@Controller('document-templates/prints/receipt')
export class ReceiptPreviewPublicController {
  @Get('view/:ticket/:fileName')
  @ApiOkResponse({ description: '按预览票据打开收据 PDF（inline + 正确文件名）' })
  viewNamed(
    @Param('ticket') ticket: string,
    @Param('fileName') _fileName: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.serve(ticket, res);
  }

  @Get('view/:ticket')
  @ApiOkResponse({ description: '按预览票据打开收据 PDF' })
  view(@Param('ticket') ticket: string, @Res({ passthrough: true }) res: Response) {
    return this.serve(ticket, res);
  }

  private serve(ticket: string, res: Response) {
    const item = getPdfPreviewTicket(ticket);
    if (!item) {
      throw new NotFoundException('预览已过期，请返回系统重新打开');
    }
    res.set({
      'Content-Type': item.contentType,
      'Content-Disposition': inlineDisposition(item.fileName),
      'Cache-Control': 'private, max-age=60',
    });
    return new StreamableFile(item.buffer);
  }
}
