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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ContractsService } from './contracts.service';
import {
  CreateContractDto,
  UpdateContractDto,
  ImportContractsDto,
  OpenContractOrderDto,
} from './dto/contract.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { parseSortDir, splitCsv } from '../common/pagination';
import { BatchDeleteDto } from '../common/batch-delete';

@ApiTags('contracts')
@Controller('contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'statuses', required: false, description: 'Comma-separated statuses' })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'roomId', required: false })
  @ApiQuery({ name: 'requirementId', required: false })
  @ApiQuery({ name: 'buildingIds', required: false, description: 'Comma-separated building ids' })
  @ApiQuery({ name: 'roomCodes', required: false, description: 'Comma-separated room codes' })
  @ApiQuery({ name: 'customerNames', required: false, description: 'Comma-separated customer names' })
  @ApiQuery({ name: 'salesManagers', required: false, description: 'Comma-separated sales manager labels' })
  @ApiQuery({ name: 'leaseTypes', required: false, description: 'Comma-separated lease types' })
  @ApiQuery({
    name: 'occupancyKeys',
    required: false,
    description: 'Comma-separated occupancy keys: whole | part | part:A',
  })
  @ApiQuery({ name: 'paymentCycles', required: false, description: 'Comma-separated payment cycles' })
  @ApiQuery({ name: 'paymentMethods', required: false, description: 'Comma-separated payment methods' })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'startDateFrom', required: false })
  @ApiQuery({ name: 'startDateTo', required: false })
  @ApiQuery({ name: 'endDateFrom', required: false })
  @ApiQuery({ name: 'endDateTo', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({
    name: 'expiringSoon',
    required: false,
    description: '1/true：套用系统设置「即将到期」条件（与整租/分租可并行）',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated contract list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('statuses') statuses?: string,
    @Query('customerId') customerId?: string,
    @Query('roomId') roomId?: string,
    @Query('requirementId') requirementId?: string,
    @Query('buildingIds') buildingIds?: string,
    @Query('roomCodes') roomCodes?: string,
    @Query('customerNames') customerNames?: string,
    @Query('salesManagers') salesManagers?: string,
    @Query('leaseTypes') leaseTypes?: string,
    @Query('occupancyKeys') occupancyKeys?: string,
    @Query('paymentCycles') paymentCycles?: string,
    @Query('paymentMethods') paymentMethods?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('startDateFrom') startDateFrom?: string,
    @Query('startDateTo') startDateTo?: string,
    @Query('endDateFrom') endDateFrom?: string,
    @Query('endDateTo') endDateTo?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('expiringSoon') expiringSoon?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const soon = String(expiringSoon || '').trim().toLowerCase();
    return this.contractsService.findAll({
      keyword,
      status,
      statuses: splitCsv(statuses),
      customerId,
      roomId,
      requirementId,
      buildingIds: splitCsv(buildingIds),
      roomCodes: splitCsv(roomCodes),
      customerNames: splitCsv(customerNames),
      salesManagers: splitCsv(salesManagers),
      leaseTypes: splitCsv(leaseTypes),
      occupancyKeys: splitCsv(occupancyKeys),
      paymentCycles: splitCsv(paymentCycles),
      paymentMethods: splitCsv(paymentMethods),
      sortBy,
      sortDir: parseSortDir(sortDir),
      startDateFrom,
      startDateTo,
      endDateFrom,
      endDateTo,
      createdAtFrom,
      createdAtTo,
      expiringSoon: soon === '1' || soon === 'true' || soon === 'yes',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @RequirePermissions('contracts:import')
  @Post('import')
  @ApiOkResponse({ description: 'Batch import contracts' })
  importBatch(@Body() dto: ImportContractsDto, @CurrentUser() user?: JwtPayload) {
    return this.contractsService.importBatch(dto, actorUserId(user));
  }

  @RequirePermissions('contracts:batchDelete')
  @Post('batch-delete')
  @ApiOkResponse({ description: 'Batch delete contracts by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.contractsService.removeMany(dto.ids);
  }

  @Get('building-counts')
  @ApiOkResponse({ description: 'Contract counts grouped by building id' })
  countByBuilding() {
    return this.contractsService.countByBuilding();
  }

  @Get('stats/occupancy')
  @ApiOkResponse({ description: 'Contract counts by occupancy mode (whole / part)' })
  countByOccupancyMode() {
    return this.contractsService.countByOccupancyMode();
  }

  @Get('stats/expiring-soon')
  @ApiOkResponse({ description: 'Count contracts matching system expiring-soon settings' })
  countExpiringSoon() {
    return this.contractsService.countExpiringSoon();
  }

  @Get('alerts/issue-blocked')
  @ApiOkResponse({
    description:
      'Signing contracts that entered the 2nd billing lead window (all pages; sorted by urgency)',
  })
  listIssueBlockedAlerts() {
    return this.contractsService.listIssueBlockedAlerts();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @RequirePermissions('contracts:create')
  @Post()
  create(@Body() dto: CreateContractDto, @CurrentUser() user?: JwtPayload) {
    return this.contractsService.create(dto, actorUserId(user));
  }

  @RequirePermissions('contracts:update')
  @Post(':id/open-order')
  @ApiOkResponse({ description: 'Open order: upload signing attachment and set status to 租賃中' })
  openOrder(
    @Param('id') id: string,
    @Body() dto: OpenContractOrderDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.contractsService.openOrder(id, dto, actorUserId(user));
  }

  @RequirePermissions('contracts:update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.contractsService.update(id, dto, actorUserId(user), {
      role: user?.role,
    });
  }

  @RequirePermissions('contracts:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contractsService.remove(id);
  }
}
