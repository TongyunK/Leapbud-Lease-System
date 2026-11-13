import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { PermissionsGuard } from '../permissions/permissions.guard'
import { splitCsv } from '../common/pagination'
import { DepositDeductionsService } from './deposit-deductions.service'

@ApiTags('deposit-deductions')
@Controller('deposit-deductions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class DepositDeductionsController {
  constructor(private readonly deductions: DepositDeductionsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'contractCodes', required: false })
  @ApiQuery({ name: 'customerNames', required: false })
  @ApiQuery({ name: 'settlementId', required: false })
  @ApiQuery({ name: 'settlementCodes', required: false })
  @ApiQuery({ name: 'quantities', required: false })
  @ApiQuery({ name: 'unitAmounts', required: false })
  @ApiQuery({ name: 'amounts', required: false })
  @ApiQuery({ name: 'roomCodes', required: false })
  @ApiQuery({ name: 'returnStatuses', required: false })
  @ApiQuery({ name: 'itemTypes', required: false })
  @ApiQuery({ name: 'createdBys', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated deposit deduction settlement items' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('contractId') contractId?: string,
    @Query('contractCodes') contractCodes?: string,
    @Query('customerNames') customerNames?: string,
    @Query('settlementId') settlementId?: string,
    @Query('settlementCodes') settlementCodes?: string,
    @Query('quantities') quantities?: string,
    @Query('unitAmounts') unitAmounts?: string,
    @Query('amounts') amounts?: string,
    @Query('subtotals') subtotals?: string,
    @Query('roomCodes') roomCodes?: string,
    @Query('returnStatuses') returnStatuses?: string,
    @Query('itemTypes') itemTypes?: string,
    @Query('createdBys') createdBys?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.deductions.findAll({
      keyword,
      contractId,
      contractCodes: splitCsv(contractCodes),
      customerNames: splitCsv(customerNames),
      settlementId,
      settlementCodes: splitCsv(settlementCodes),
      quantities: splitCsv(quantities),
      unitAmounts: splitCsv(unitAmounts),
      amounts: splitCsv(amounts || subtotals),
      roomCodes: splitCsv(roomCodes),
      returnStatuses: splitCsv(returnStatuses),
      itemTypes: splitCsv(itemTypes),
      createdBys: splitCsv(createdBys),
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      createdAtFrom,
      createdAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    })
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.deductions.findOne(id)
  }
}
