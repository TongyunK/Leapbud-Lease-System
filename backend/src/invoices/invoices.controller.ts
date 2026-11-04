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
  @ApiQuery({ name: 'invoiceCodes', required: false, description: 'Comma-separated invoice codes' })
  @ApiQuery({ name: 'contractCodes', required: false, description: 'Comma-separated contract / short-term codes' })
  @ApiQuery({ name: 'customerNames', required: false, description: 'Comma-separated customer names' })
  @ApiQuery({ name: 'buildingNames', required: false, description: 'Comma-separated building names' })
  @ApiQuery({ name: 'roomNames', required: false, description: 'Comma-separated room names / codes' })
  @ApiQuery({ name: 'invoiceTypes', required: false, description: 'Comma-separated invoice types' })
  @ApiQuery({ name: 'amounts', required: false, description: 'Comma-separated amounts' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'salesManagers', required: false, description: 'Comma-separated sales manager labels' })
  @ApiQuery({ name: 'sources', required: false, description: 'Comma-separated: contract | short_term' })
  @ApiQuery({ name: 'source', required: false, description: 'contract | short_term（页头快捷）' })
  @ApiQuery({
    name: 'billingKind',
    required: false,
    description: 'manual | auto',
  })
  @ApiQuery({ name: 'createdBys', required: false, description: 'Comma-separated creator labels' })
  @ApiQuery({
    name: 'depositOnly',
    required: false,
    description: 'true=仅按金发票（invoiceType=Deposit）；可与 source=contract 叠加',
  })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'invoiceDateFrom', required: false })
  @ApiQuery({ name: 'invoiceDateTo', required: false })
  @ApiQuery({ name: 'invoiceDateEmpty', required: false })
  @ApiQuery({ name: 'paymentDueDateFrom', required: false })
  @ApiQuery({ name: 'paymentDueDateTo', required: false })
  @ApiQuery({ name: 'paymentDueDateEmpty', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'createdAtEmpty', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated invoice list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('contractId') contractId?: string,
    @Query('customerId') customerId?: string,
    @Query('roomId') roomId?: string,
    @Query('invoiceCodes') invoiceCodes?: string,
    @Query('contractCodes') contractCodes?: string,
    @Query('customerNames') customerNames?: string,
    @Query('buildingNames') buildingNames?: string,
    @Query('roomNames') roomNames?: string,
    @Query('invoiceTypes') invoiceTypes?: string,
    @Query('amounts') amounts?: string,
    @Query('status') status?: string,
    @Query('salesManagers') salesManagers?: string,
    @Query('sources') sources?: string,
    @Query('source') source?: string,
    @Query('billingKind') billingKind?: string,
    @Query('createdBys') createdBys?: string,
    @Query('depositOnly') depositOnly?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('invoiceDateFrom') invoiceDateFrom?: string,
    @Query('invoiceDateTo') invoiceDateTo?: string,
    @Query('invoiceDateEmpty') invoiceDateEmpty?: string,
    @Query('paymentDueDateFrom') paymentDueDateFrom?: string,
    @Query('paymentDueDateTo') paymentDueDateTo?: string,
    @Query('paymentDueDateEmpty') paymentDueDateEmpty?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('createdAtEmpty') createdAtEmpty?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const flag = (v?: string) =>
      ['1', 'true', 'yes'].includes(String(v || '').trim().toLowerCase())
    const depositFlag = flag(depositOnly)
    return this.invoicesService.findAll({
      keyword,
      contractId,
      customerId,
      roomId,
      invoiceCodes: splitCsv(invoiceCodes),
      contractCodes: splitCsv(contractCodes),
      customerNames: splitCsv(customerNames),
      buildingNames: splitCsv(buildingNames),
      roomNames: splitCsv(roomNames),
      invoiceTypes: splitCsv(invoiceTypes),
      amounts: splitCsv(amounts),
      status,
      salesManagers: splitCsv(salesManagers),
      sources: splitCsv(sources),
      source,
      billingKind,
      createdBys: splitCsv(createdBys),
      depositOnly: depositFlag || undefined,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      invoiceDateFrom,
      invoiceDateTo,
      invoiceDateEmpty: flag(invoiceDateEmpty) || undefined,
      paymentDueDateFrom,
      paymentDueDateTo,
      paymentDueDateEmpty: flag(paymentDueDateEmpty) || undefined,
      createdAtFrom,
      createdAtTo,
      createdAtEmpty: flag(createdAtEmpty) || undefined,
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

  @Get('code-preview')
  @ApiQuery({ name: 'contractId', required: false, description: '合约票：带合约房间后缀' })
  @ApiQuery({ name: 'roomId', required: false, description: '短租票：带房间编号后缀' })
  @ApiOkResponse({ description: 'Preview next invoice code without consuming sequence' })
  previewCode(
    @Query('contractId') contractId?: string,
    @Query('roomId') roomId?: string,
  ) {
    return this.invoicesService.previewInvoiceCode(contractId, roomId)
  }

  @Get('stats/source')
  @ApiOkResponse({ description: 'Invoice counts by source (contract / short_term)' })
  countBySource() {
    return this.invoicesService.countBySource()
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
