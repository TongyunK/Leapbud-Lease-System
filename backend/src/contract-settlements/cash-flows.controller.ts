import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { PermissionsGuard } from '../permissions/permissions.guard'
import { RequirePermissions } from '../permissions/require-permissions.decorator'
import { CurrentUser, actorUserId } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/jwt-auth.guard'
import { splitCsv } from '../common/pagination'
import { CashFlowsQueryService } from './cash-flows-query.service'

@ApiTags('cash-flows')
@Controller('cash-flows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class CashFlowsController {
  constructor(private readonly cashFlows: CashFlowsQueryService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'receiptId', required: false })
  @ApiQuery({ name: 'refundOrderId', required: false })
  @ApiQuery({ name: 'invoiceId', required: false })
  @ApiQuery({ name: 'receivableId', required: false })
  @ApiQuery({ name: 'direction', required: false })
  @ApiQuery({ name: 'sourceType', required: false })
  @ApiQuery({ name: 'flowCodes', required: false })
  @ApiQuery({ name: 'directions', required: false })
  @ApiQuery({ name: 'sourceTypes', required: false })
  @ApiQuery({ name: 'sourceRefs', required: false })
  @ApiQuery({ name: 'contractCodes', required: false })
  @ApiQuery({ name: 'customerNames', required: false })
  @ApiQuery({ name: 'amounts', required: false })
  @ApiQuery({ name: 'receiptCounts', required: false })
  @ApiQuery({ name: 'refundOrderCounts', required: false })
  @ApiQuery({ name: 'createdBys', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'flowDateFrom', required: false })
  @ApiQuery({ name: 'flowDateTo', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated cash flows (read-only)' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('contractId') contractId?: string,
    @Query('customerId') customerId?: string,
    @Query('receiptId') receiptId?: string,
    @Query('refundOrderId') refundOrderId?: string,
    @Query('invoiceId') invoiceId?: string,
    @Query('receivableId') receivableId?: string,
    @Query('direction') direction?: string,
    @Query('sourceType') sourceType?: string,
    @Query('flowCodes') flowCodes?: string,
    @Query('directions') directions?: string,
    @Query('sourceTypes') sourceTypes?: string,
    @Query('sourceRefs') sourceRefs?: string,
    @Query('contractCodes') contractCodes?: string,
    @Query('customerNames') customerNames?: string,
    @Query('amounts') amounts?: string,
    @Query('receiptCounts') receiptCounts?: string,
    @Query('refundOrderCounts') refundOrderCounts?: string,
    @Query('createdBys') createdBys?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('flowDateFrom') flowDateFrom?: string,
    @Query('flowDateTo') flowDateTo?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.cashFlows.findAll({
      keyword,
      contractId,
      customerId,
      receiptId,
      refundOrderId,
      invoiceId,
      receivableId,
      direction,
      sourceType,
      flowCodes: splitCsv(flowCodes),
      directions: splitCsv(directions),
      sourceTypes: splitCsv(sourceTypes),
      sourceRefs: splitCsv(sourceRefs),
      contractCodes: splitCsv(contractCodes),
      customerNames: splitCsv(customerNames),
      amounts: splitCsv(amounts),
      receiptCounts: splitCsv(receiptCounts),
      refundOrderCounts: splitCsv(refundOrderCounts),
      createdBys: splitCsv(createdBys),
      sortBy,
      sortDir,
      flowDateFrom,
      flowDateTo,
      createdAtFrom,
      createdAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    })
  }

  @Get('stats/direction')
  @ApiOkResponse({
    description: 'Cash flow counts by direction (all / in / out)',
  })
  countByDirection() {
    return this.cashFlows.countByDirection()
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Cash flow detail' })
  findOne(@Param('id') id: string) {
    return this.cashFlows.findOne(id)
  }

  @Delete(':id')
  @RequirePermissions('cashFlows:delete')
  @ApiOkResponse({ description: 'Delete cash flow' })
  remove(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    return this.cashFlows.remove(id, actorUserId(user))
  }
}
