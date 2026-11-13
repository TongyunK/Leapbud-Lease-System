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
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { PermissionsGuard } from '../permissions/permissions.guard'
import { RequirePermissions } from '../permissions/require-permissions.decorator'
import { CurrentUser, actorUserId } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/jwt-auth.guard'
import { ContractSettlementsService } from './contract-settlements.service'
import { VacateConductService } from './vacate-conduct.service'
import { ReceivableWriteoffsQueryService } from './receivable-writeoffs-query.service'
import { ContractChangeLogsQueryService } from './contract-change-logs-query.service'
import { DepositDeductionsService } from './deposit-deductions.service'
import { splitCsv } from '../common/pagination'
import {
  ConductVacateSettlementDto,
  CreateVacateSettlementDto,
  ImportVacateSettlementsDto,
  UpdateVacateSettlementDto,
} from './dto/vacate-conduct.dto'

@ApiTags('contract-settlements')
@Controller('contract-settlements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class ContractSettlementsController {
  constructor(
    private readonly settlements: ContractSettlementsService,
    private readonly vacateConduct: VacateConductService,
    private readonly writeoffs: ReceivableWriteoffsQueryService,
    private readonly changeLogs: ContractChangeLogsQueryService,
    private readonly deductions: DepositDeductionsService,
  ) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'settlementCodes', required: false })
  @ApiQuery({ name: 'types', required: false })
  @ApiQuery({ name: 'statuses', required: false })
  @ApiQuery({ name: 'contractCodes', required: false })
  @ApiQuery({ name: 'customerNames', required: false })
  @ApiQuery({ name: 'roomCodes', required: false })
  @ApiQuery({ name: 'reasons', required: false })
  @ApiQuery({ name: 'doorKeyReturnedQtys', required: false })
  @ApiQuery({ name: 'smartCardReturnedQtys', required: false })
  @ApiQuery({ name: 'itemCounts', required: false })
  @ApiQuery({ name: 'writeoffCounts', required: false })
  @ApiQuery({ name: 'refundOrderCounts', required: false })
  @ApiQuery({ name: 'refundDueTotals', required: false })
  @ApiQuery({ name: 'refundedTotals', required: false })
  @ApiQuery({ name: 'refundRemainings', required: false })
  @ApiQuery({ name: 'createdBys', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'settlementDateFrom', required: false })
  @ApiQuery({ name: 'settlementDateTo', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated contract settlements' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('contractId') contractId?: string,
    @Query('customerId') customerId?: string,
    @Query('settlementCodes') settlementCodes?: string,
    @Query('types') types?: string,
    @Query('statuses') statuses?: string,
    @Query('refundStatuses') refundStatuses?: string,
    @Query('collectStatuses') collectStatuses?: string,
    @Query('contractCodes') contractCodes?: string,
    @Query('customerNames') customerNames?: string,
    @Query('roomCodes') roomCodes?: string,
    @Query('reasons') reasons?: string,
    @Query('doorKeyReturnedQtys') doorKeyReturnedQtys?: string,
    @Query('smartCardReturnedQtys') smartCardReturnedQtys?: string,
    @Query('itemCounts') itemCounts?: string,
    @Query('writeoffCounts') writeoffCounts?: string,
    @Query('refundOrderCounts') refundOrderCounts?: string,
    @Query('refundDueTotals') refundDueTotals?: string,
    @Query('refundedTotals') refundedTotals?: string,
    @Query('refundRemainings') refundRemainings?: string,
    @Query('collectDueTotals') collectDueTotals?: string,
    @Query('collectedTotals') collectedTotals?: string,
    @Query('collectRemainings') collectRemainings?: string,
    @Query('createdBys') createdBys?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('settlementDateFrom') settlementDateFrom?: string,
    @Query('settlementDateTo') settlementDateTo?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.settlements.findAll({
      keyword,
      contractId,
      customerId,
      settlementCodes: splitCsv(settlementCodes),
      types: splitCsv(types),
      statuses: splitCsv(statuses),
      refundStatuses: splitCsv(refundStatuses),
      collectStatuses: splitCsv(collectStatuses),
      contractCodes: splitCsv(contractCodes),
      customerNames: splitCsv(customerNames),
      roomCodes: splitCsv(roomCodes),
      reasons: splitCsv(reasons),
      doorKeyReturnedQtys: splitCsv(doorKeyReturnedQtys),
      smartCardReturnedQtys: splitCsv(smartCardReturnedQtys),
      itemCounts: splitCsv(itemCounts),
      writeoffCounts: splitCsv(writeoffCounts),
      refundOrderCounts: splitCsv(refundOrderCounts),
      refundDueTotals: splitCsv(refundDueTotals),
      refundedTotals: splitCsv(refundedTotals),
      refundRemainings: splitCsv(refundRemainings),
      collectDueTotals: splitCsv(collectDueTotals),
      collectedTotals: splitCsv(collectedTotals),
      collectRemainings: splitCsv(collectRemainings),
      createdBys: splitCsv(createdBys),
      sortBy,
      sortDir,
      settlementDateFrom,
      settlementDateTo,
      createdAtFrom,
      createdAtTo,
      type,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    })
  }

  @Get('by-contract/:contractId')
  @ApiOkResponse({ description: 'Settlements for one contract' })
  findByContract(@Param('contractId') contractId: string) {
    return this.settlements.findByContract(contractId)
  }

  @Get('change-logs/by-contract/:contractId')
  @ApiOkResponse({ description: 'Contract change logs' })
  changeLogsByContract(@Param('contractId') contractId: string) {
    return this.changeLogs.listByContract(contractId)
  }

  @Get('writeoffs/by-receivable/:receivableId')
  @ApiOkResponse({ description: 'Writeoffs for one receivable' })
  writeoffsByReceivable(@Param('receivableId') receivableId: string) {
    return this.writeoffs.listByReceivable(receivableId)
  }

  @Get('deduction-items')
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
  @ApiOkResponse({ description: '按金扣除明细（DAMAGE/PENALTY settlement items）' })
  deductionItems(
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

  @Get('deduction-items/:id')
  @ApiOkResponse({ description: '按金扣除明细详情' })
  deductionItemOne(@Param('id') id: string) {
    return this.deductions.findOne(id)
  }

  @Get('conduct-preview')
  @ApiQuery({ name: 'contractId', required: true })
  @ApiOkResponse({ description: '合约退租办理预览（借出物品／按金／定金／未结应收）' })
  conductPreview(@Query('contractId') contractId?: string) {
    return this.vacateConduct.previewConduct(contractId || '')
  }

  @RequirePermissions('contractSettlements:create')
  @Post('conduct-vacate')
  @ApiOkResponse({ description: '一键退租办理（验收借出、扣按金、按金/定金退还、写入 VACATE 结算）' })
  conductVacate(
    @Body() dto: ConductVacateSettlementDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.vacateConduct.conduct(dto, actorUserId(user))
  }

  @RequirePermissions('contractSettlements:import')
  @Post('import-vacate')
  @ApiOkResponse({ description: '批量导入 VACATE 结算（现场字段）' })
  importVacate(
    @Body() dto: ImportVacateSettlementsDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.settlements.importVacateBatch(dto, actorUserId(user))
  }

  @RequirePermissions('contractSettlements:create')
  @Post('vacate')
  @ApiOkResponse({ description: '手工新增 VACATE 结算' })
  createVacate(
    @Body() dto: CreateVacateSettlementDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.settlements.createVacate(dto, actorUserId(user))
  }

  @RequirePermissions('contractSettlements:update')
  @Patch('vacate/:id')
  @ApiOkResponse({ description: '更新 VACATE 结算现场字段' })
  updateVacate(
    @Param('id') id: string,
    @Body() dto: UpdateVacateSettlementDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.settlements.updateVacate(id, dto, actorUserId(user))
  }

  @Get(':id/writeoffs')
  @ApiOkResponse({ description: 'Writeoffs for one settlement' })
  writeoffsBySettlement(@Param('id') id: string) {
    return this.writeoffs.listBySettlement(id)
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Settlement detail' })
  findOne(@Param('id') id: string) {
    return this.settlements.findOne(id)
  }

  @Delete(':id')
  @RequirePermissions('contractSettlements:delete')
  @ApiOkResponse({ description: 'Delete settlement (cascades refund orders / cash flows / writeoffs)' })
  remove(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    return this.settlements.remove(id, actorUserId(user))
  }
}
