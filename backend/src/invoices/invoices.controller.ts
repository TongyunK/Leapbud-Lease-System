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
import { InvoicesService } from './invoices.service'
import { InvoiceAutoService } from './invoice-auto.service'
import {
  CreateInvoiceDto,
  ImportInvoicesDto,
  UpdateInvoiceDto,
} from './dto/invoice.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/jwt-auth.guard'
import { BatchDeleteDto } from '../common/batch-delete'
import { splitCsv } from '../common/pagination'

@ApiTags('invoices')
@Controller('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly invoiceAuto: InvoiceAutoService,
  ) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'roomId', required: false })
  @ApiQuery({ name: 'customerNames', required: false, description: 'Comma-separated customer names' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'invoiceDateFrom', required: false })
  @ApiQuery({ name: 'invoiceDateTo', required: false })
  @ApiQuery({ name: 'paymentDueDateFrom', required: false })
  @ApiQuery({ name: 'paymentDueDateTo', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated invoice list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('contractId') contractId?: string,
    @Query('customerId') customerId?: string,
    @Query('roomId') roomId?: string,
    @Query('customerNames') customerNames?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('invoiceDateFrom') invoiceDateFrom?: string,
    @Query('invoiceDateTo') invoiceDateTo?: string,
    @Query('paymentDueDateFrom') paymentDueDateFrom?: string,
    @Query('paymentDueDateTo') paymentDueDateTo?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.invoicesService.findAll({
      keyword,
      contractId,
      customerId,
      roomId,
      customerNames: splitCsv(customerNames),
      status,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      invoiceDateFrom,
      invoiceDateTo,
      paymentDueDateFrom,
      paymentDueDateTo,
      createdAtFrom,
      createdAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    })
  }

  @RequirePermissions('invoices:import')
  @Post('import')
  @ApiOkResponse({ description: 'Batch import invoices' })
  importBatch(@Body() dto: ImportInvoicesDto, @CurrentUser() user?: JwtPayload) {
    return this.invoicesService.importBatch(dto, actorUserId(user))
  }

  @Post('batch-delete')
  @RequirePermissions('invoices:batchDelete')
  @ApiOkResponse({ description: 'Batch delete invoices' })
  batchDelete(@Body() dto: BatchDeleteDto) {
    return this.invoicesService.removeMany(dto.ids || [])
  }

  /** 手动触发：为即将到期（提前天数取系统参数）的缴费周期开设租金发票 */
  @Post('jobs/due-rent')
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Run due rent invoice job (lead days from system settings)' })
  runDueRentJob() {
    return this.invoiceAuto.runDueRentInvoices()
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Invoice detail' })
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id)
  }

  @RequirePermissions('invoices:create')
  @Post()
  @ApiOkResponse({ description: 'Create invoice' })
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user?: JwtPayload) {
    return this.invoicesService.create(dto, actorUserId(user))
  }

  @RequirePermissions('invoices:update')
  @Patch(':id')
  @ApiOkResponse({ description: 'Update invoice' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.invoicesService.update(id, dto, actorUserId(user))
  }

  @RequirePermissions('invoices:delete')
  @Delete(':id')
  @ApiOkResponse({ description: 'Delete invoice' })
  remove(@Param('id') id: string) {
    return this.invoicesService.remove(id)
  }
}
