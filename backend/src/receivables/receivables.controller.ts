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
import { ReceivablesService } from './receivables.service'
import {
  CreateReceivableDto,
  ImportReceivablesDto,
  UpdateReceivableDto,
} from './dto/receivable.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/jwt-auth.guard'
import { BatchDeleteDto } from '../common/batch-delete'
import { splitCsv } from '../common/pagination'

@ApiTags('receivables')
@Controller('receivables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class ReceivablesController {
  constructor(private readonly receivablesService: ReceivablesService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'invoiceId', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'depositRefundId', required: false })
  @ApiQuery({ name: 'customerNames', required: false, description: 'Comma-separated customer names' })
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
  @ApiOkResponse({ description: 'Paginated receivable list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('invoiceId') invoiceId?: string,
    @Query('contractId') contractId?: string,
    @Query('customerId') customerId?: string,
    @Query('depositRefundId') depositRefundId?: string,
    @Query('customerNames') customerNames?: string,
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
    return this.receivablesService.findAll({
      keyword,
      invoiceId,
      contractId,
      customerId,
      depositRefundId,
      customerNames: splitCsv(customerNames),
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

  @RequirePermissions('receivables:import')
  @Post('import')
  @ApiOkResponse({ description: 'Batch import receivables' })
  importBatch(@Body() dto: ImportReceivablesDto, @CurrentUser() user?: JwtPayload) {
    return this.receivablesService.importBatch(dto, actorUserId(user))
  }

  @Post('batch-delete')
  @RequirePermissions('receivables:batchDelete')
  @ApiOkResponse({ description: 'Batch delete receivables' })
  batchDelete(@Body() dto: BatchDeleteDto) {
    return this.receivablesService.removeMany(dto.ids || [])
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Receivable detail' })
  findOne(@Param('id') id: string) {
    return this.receivablesService.findOne(id)
  }

  @RequirePermissions('receivables:create')
  @Post()
  @ApiOkResponse({ description: 'Create receivable' })
  create(@Body() dto: CreateReceivableDto, @CurrentUser() user?: JwtPayload) {
    return this.receivablesService.create(dto, actorUserId(user))
  }

  @RequirePermissions('receivables:update')
  @Patch(':id')
  @ApiOkResponse({ description: 'Update receivable' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReceivableDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.receivablesService.update(id, dto, actorUserId(user))
  }

  @RequirePermissions('receivables:delete')
  @Delete(':id')
  @ApiOkResponse({ description: 'Delete receivable' })
  remove(@Param('id') id: string) {
    return this.receivablesService.remove(id)
  }
}
