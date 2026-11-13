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
import { BookingDepositService } from './booking-deposit.service'
import {
  CollectWithBookingDepositDto,
  CreateReceiptDto,
  ImportReceiptsDto,
  RefundBookingDepositDto,
  TopUpBookingDepositDto,
  UpdateReceiptDto,
} from './dto/receipt.dto'
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
  constructor(
    private readonly receiptsService: ReceiptsService,
    private readonly bookingDepositService: BookingDepositService,
  ) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'customerNames', required: false, description: 'Comma-separated customer names' })
  @ApiQuery({ name: 'paymentMethod', required: false, description: 'Comma-separated payment methods' })
  @ApiQuery({ name: 'receiptCodes', required: false })
  @ApiQuery({ name: 'contractCodes', required: false, description: 'Comma-separated contract codes' })
  @ApiQuery({ name: 'invoiceCodes', required: false, description: 'Comma-separated invoice codes' })
  @ApiQuery({ name: 'receivableCodes', required: false, description: 'Comma-separated receivable codes' })
  @ApiQuery({ name: 'amounts', required: false })
  @ApiQuery({ name: 'remarks', required: false })
  @ApiQuery({ name: 'changeLogs', required: false })
  @ApiQuery({ name: 'createdBys', required: false })
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
  @ApiQuery({ name: 'cashFlowCounts', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated receipt list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('customerId') customerId?: string,
    @Query('customerNames') customerNames?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('kinds') kinds?: string,
    @Query('receiptCodes') receiptCodes?: string,
    @Query('contractCodes') contractCodes?: string,
    @Query('invoiceCodes') invoiceCodes?: string,
    @Query('receivableCodes') receivableCodes?: string,
    @Query('amounts') amounts?: string,
    @Query('remarks') remarks?: string,
    @Query('changeLogs') changeLogs?: string,
    @Query('createdBys') createdBys?: string,
    @Query('contractId') contractId?: string,
    @Query('invoiceId') invoiceId?: string,
    @Query('receivableId') receivableId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('paymentDateFrom') paymentDateFrom?: string,
    @Query('paymentDateTo') paymentDateTo?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('cashFlowCounts') cashFlowCounts?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.receiptsService.findAll({
      keyword,
      customerId,
      customerNames: splitCsv(customerNames),
      paymentMethods: splitCsv(paymentMethod),
      kinds: splitCsv(kinds),
      receiptCodes: splitCsv(receiptCodes),
      contractCodes: splitCsv(contractCodes),
      invoiceCodes: splitCsv(invoiceCodes),
      receivableCodes: splitCsv(receivableCodes),
      amounts: splitCsv(amounts),
      remarks: splitCsv(remarks),
      changeLogs: splitCsv(changeLogs),
      createdBys: splitCsv(createdBys),
      contractId,
      invoiceId,
      receivableId,
      sortBy,
      sortDir: parseSortDir(sortDir),
      paymentDateFrom,
      paymentDateTo,
      createdAtFrom,
      createdAtTo,
      cashFlowCounts: splitCsv(cashFlowCounts),
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
  @ApiOkResponse({
    description: 'Receipt counts by kind (all / invoice / booking_deposit)',
  })
  countByKind() {
    return this.receiptsService.countByKind()
  }

  @Get('booking-deposit/by-contract/:contractId')
  @ApiOkResponse({ description: '合约定金账户（余额与动账）' })
  bookingDepositByContract(@Param('contractId') contractId: string) {
    return this.bookingDepositService.getAccountByContractId(contractId)
  }

  @Get('booking-deposit/applies')
  @ApiOkResponse({ description: '按合约 / 应收 / 发票列出定金抵扣动账' })
  bookingDepositApplies(
    @Query('contractId') contractId?: string,
    @Query('receivableId') receivableId?: string,
    @Query('invoiceId') invoiceId?: string,
  ) {
    return this.bookingDepositService.listApplies({
      contractId,
      receivableId,
      invoiceId,
    })
  }

  @RequirePermissions('receipts:create')
  @Post('collect-with-booking-deposit')
  @ApiOkResponse({ description: '合约收款：自选应收 + 定金抵扣' })
  collectWithBookingDeposit(
    @Body() dto: CollectWithBookingDepositDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.bookingDepositService.collectWithDeposit(dto, actorUserId(user))
  }

  @RequirePermissions('receipts:create')
  @Post('booking-deposit/refund')
  @ApiOkResponse({ description: '退还定金挂账余额' })
  refundBookingDeposit(
    @Body() dto: RefundBookingDepositDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.bookingDepositService.refund(dto, actorUserId(user))
  }

  @RequirePermissions('receipts:create')
  @Post('booking-deposit/top-up')
  @ApiOkResponse({ description: '签约中加收定金（累加定金收据本金）' })
  topUpBookingDeposit(
    @Body() dto: TopUpBookingDepositDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.bookingDepositService.topUp(dto, actorUserId(user))
  }

  @Get(':id/booking-deposit-account')
  @ApiOkResponse({ description: '定金收据账户详情' })
  bookingDepositByReceipt(@Param('id') id: string) {
    return this.bookingDepositService.getAccountByReceiptId(id)
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
