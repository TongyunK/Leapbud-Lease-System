import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { ReceiptsService } from './receipts.service'
import { CreateReceiptDto, ImportReceiptsDto, UpdateReceiptDto } from './dto/receipt.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { CurrentUser, actorUserId } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/jwt-auth.guard'
import { BatchDeleteDto } from '../common/batch-delete'
import { parseSortDir, splitCsv } from '../common/pagination'

@ApiTags('receipts')
@Controller('receipts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
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

  @Post('import')
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Batch import receipts' })
  importBatch(@Body() dto: ImportReceiptsDto, @CurrentUser() user?: JwtPayload) {
    return this.receiptsService.importBatch(dto, actorUserId(user))
  }

  @Post('batch-delete')
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Batch delete receipts' })
  batchDelete(@Body() dto: BatchDeleteDto) {
    return this.receiptsService.removeMany(dto.ids || [])
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Receipt detail' })
  findOne(@Param('id') id: string) {
    return this.receiptsService.findOne(id)
  }

  @Post()
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Create receipt' })
  create(@Body() dto: CreateReceiptDto, @CurrentUser() user?: JwtPayload) {
    return this.receiptsService.create(dto, actorUserId(user))
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Update receipt' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReceiptDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.receiptsService.update(id, dto, actorUserId(user))
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Delete receipt' })
  remove(@Param('id') id: string) {
    return this.receiptsService.remove(id)
  }
}
