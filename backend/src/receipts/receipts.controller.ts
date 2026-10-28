import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { memoryStorage } from 'multer'
import { ReceiptsService } from './receipts.service'
import { CreateReceiptDto, ImportReceiptsDto, UpdateReceiptDto } from './dto/receipt.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { PermissionsGuard } from '../permissions/permissions.guard'
import { RequirePermissions } from '../permissions/require-permissions.decorator'
import { CurrentUser, actorUserId } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/jwt-auth.guard'
import { BatchDeleteDto } from '../common/batch-delete'
import { parseSortDir, splitCsv } from '../common/pagination'

@ApiTags('receipts')
@Controller('receipts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'customerNames', required: false, description: 'Comma-separated customer names' })
  @ApiQuery({ name: 'paymentMethod', required: false, description: 'Comma-separated payment methods' })
  @ApiQuery({ name: 'contractCodes', required: false, description: 'Comma-separated contract codes' })
  @ApiQuery({ name: 'invoiceCodes', required: false, description: 'Comma-separated invoice codes' })
  @ApiQuery({ name: 'receivableCodes', required: false, description: 'Comma-separated receivable codes' })
  @ApiQuery({ name: 'kinds', required: false, description: 'Comma-separated: booking_deposit,invoice' })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'invoiceId', required: false })
  @ApiQuery({ name: 'receivableId', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'paymentDateFrom', required: false })
  @ApiQuery({ name: 'paymentDateTo', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated receipt list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('customerId') customerId?: string,
    @Query('customerNames') customerNames?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('kinds') kinds?: string,
    @Query('contractCodes') contractCodes?: string,
    @Query('invoiceCodes') invoiceCodes?: string,
    @Query('receivableCodes') receivableCodes?: string,
    @Query('contractId') contractId?: string,
    @Query('invoiceId') invoiceId?: string,
    @Query('receivableId') receivableId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('paymentDateFrom') paymentDateFrom?: string,
    @Query('paymentDateTo') paymentDateTo?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.receiptsService.findAll({
      keyword,
      customerId,
      customerNames: splitCsv(customerNames),
      paymentMethods: splitCsv(paymentMethod),
      kinds: splitCsv(kinds),
      contractCodes: splitCsv(contractCodes),
      invoiceCodes: splitCsv(invoiceCodes),
      receivableCodes: splitCsv(receivableCodes),
      contractId,
      invoiceId,
      receivableId,
      sortBy,
      sortDir: parseSortDir(sortDir),
      paymentDateFrom,
      paymentDateTo,
      createdAtFrom,
      createdAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    })
  }

  @RequirePermissions('receipts:import')
  @Post('import')
  @ApiOkResponse({ description: 'Batch import receipts' })
  importBatch(@Body() dto: ImportReceiptsDto, @CurrentUser() user?: JwtPayload) {
    return this.receiptsService.importBatch(dto, actorUserId(user))
  }

  @Post('batch-delete')
  @RequirePermissions('receipts:batchDelete')
  @ApiOkResponse({ description: 'Batch delete receipts' })
  batchDelete(@Body() dto: BatchDeleteDto) {
    return this.receiptsService.removeMany(dto.ids || [])
  }

  @Get('stats/kind')
  @ApiOkResponse({ description: 'Receipt counts by kind (invoice / booking_deposit)' })
  countByKind() {
    return this.receiptsService.countByKind()
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Receipt detail' })
  findOne(@Param('id') id: string) {
    return this.receiptsService.findOne(id)
  }

  @RequirePermissions('receipts:create')
  @Post()
  @ApiOkResponse({ description: 'Create receipt' })
  create(@Body() dto: CreateReceiptDto, @CurrentUser() user?: JwtPayload) {
    return this.receiptsService.create(dto, actorUserId(user))
  }

  @RequirePermissions('receipts:update')
  @Patch(':id')
  @ApiOkResponse({ description: 'Update receipt' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReceiptDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.receiptsService.update(id, dto, actorUserId(user))
  }

  @Post(':id/attachments')
  @RequirePermissions('receipts:update')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 30, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiOkResponse({ description: 'Upload one or more receipt attachments' })
  uploadAttachments(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.receiptsService.uploadAttachments(id, files || [], actorUserId(user))
  }

  @Get(':id/attachments/:attachmentId/file')
  @ApiOkResponse({ description: 'Stream receipt attachment file' })
  getAttachmentFile(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.receiptsService.getAttachmentFile(id, attachmentId)
  }

  @Delete(':id/attachments/:attachmentId')
  @RequirePermissions('receipts:update')
  @ApiOkResponse({ description: 'Delete one receipt attachment' })
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.receiptsService.removeAttachment(id, attachmentId)
  }

  @RequirePermissions('receipts:delete')
  @Delete(':id')
  @ApiOkResponse({ description: 'Delete receipt' })
  remove(@Param('id') id: string) {
    return this.receiptsService.remove(id)
  }
}
