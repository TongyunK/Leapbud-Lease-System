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
import { CustomerRequirementsService } from './customer-requirements.service';
import {
  CreateCustomerRequirementDto,
  ImportCustomerRequirementsDto,
  UpdateCustomerRequirementDto,
} from './dto/customer-requirement.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { parseSortDir, splitCsv } from '../common/pagination';
import { BatchDeleteDto } from '../common/batch-delete';

@ApiTags('customer-requirements')
@Controller('customer-requirements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class CustomerRequirementsController {
  constructor(private readonly customerRequirementsService: CustomerRequirementsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'statuses', required: false, description: 'Comma-separated statuses' })
  @ApiQuery({ name: 'rentalTypes', required: false, description: 'Comma-separated: long,short' })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'customerNames', required: false })
  @ApiQuery({ name: 'salesManagers', required: false })
  @ApiQuery({ name: 'requirementCodes', required: false })
  @ApiQuery({ name: 'leaseDurations', required: false })
  @ApiQuery({ name: 'budgets', required: false })
  @ApiQuery({ name: 'sizeConfigLabels', required: false })
  @ApiQuery({ name: 'acConfigLabels', required: false })
  @ApiQuery({ name: 'windowConfigLabels', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'requirementDateFrom', required: false })
  @ApiQuery({ name: 'requirementDateTo', required: false })
  @ApiQuery({ name: 'requirementDateEmpty', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'createdAtEmpty', required: false })
  @ApiQuery({ name: 'createdBys', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated customer requirement list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('statuses') statuses?: string,
    @Query('rentalTypes') rentalTypes?: string,
    @Query('customerId') customerId?: string,
    @Query('customerNames') customerNames?: string,
    @Query('salesManagers') salesManagers?: string,
    @Query('requirementCodes') requirementCodes?: string,
    @Query('leaseDurations') leaseDurations?: string,
    @Query('budgets') budgets?: string,
    @Query('sizeConfigLabels') sizeConfigLabels?: string,
    @Query('acConfigLabels') acConfigLabels?: string,
    @Query('windowConfigLabels') windowConfigLabels?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('requirementDateFrom') requirementDateFrom?: string,
    @Query('requirementDateTo') requirementDateTo?: string,
    @Query('requirementDateEmpty') requirementDateEmpty?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('createdAtEmpty') createdAtEmpty?: string,
    @Query('createdBys') createdBys?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const flag = (v?: string) =>
      ['1', 'true', 'yes'].includes(String(v || '').trim().toLowerCase());
    return this.customerRequirementsService.findAll({
      keyword,
      status,
      statuses: splitCsv(statuses),
      rentalTypes: splitCsv(rentalTypes),
      customerId,
      customerNames: splitCsv(customerNames),
      salesManagers: splitCsv(salesManagers),
      requirementCodes: splitCsv(requirementCodes),
      leaseDurations: splitCsv(leaseDurations),
      budgets: splitCsv(budgets),
      sizeConfigLabels: splitCsv(sizeConfigLabels),
      acConfigLabels: splitCsv(acConfigLabels),
      windowConfigLabels: splitCsv(windowConfigLabels),
      sortBy,
      sortDir: parseSortDir(sortDir),
      requirementDateFrom,
      requirementDateTo,
      requirementDateEmpty: flag(requirementDateEmpty) || undefined,
      createdAtFrom,
      createdAtTo,
      createdAtEmpty: flag(createdAtEmpty) || undefined,
      createdBys: splitCsv(createdBys),
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('code-preview')
  @ApiOkResponse({ description: 'Preview next requirement code without consuming sequence' })
  previewCode() {
    return this.customerRequirementsService.previewRequirementCode();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customerRequirementsService.findOne(id);
  }

  @RequirePermissions('customerRequirements:import')
  @Post('import')
  @ApiOkResponse({ description: 'Batch import customer requirements (upsert by requirementCode)' })
  importBatch(@Body() dto: ImportCustomerRequirementsDto, @CurrentUser() user?: JwtPayload) {
    return this.customerRequirementsService.importBatch(dto, actorUserId(user));
  }

  @RequirePermissions('customerRequirements:batchDelete')
  @Post('batch-delete')
  @ApiOkResponse({ description: 'Batch cancel customer requirements (set status to 已取消)' })
  removeMany(@Body() dto: BatchDeleteDto, @CurrentUser() user?: JwtPayload) {
    return this.customerRequirementsService.removeMany(dto.ids, actorUserId(user));
  }

  @RequirePermissions('customerRequirements:create')
  @Post()
  create(@Body() dto: CreateCustomerRequirementDto, @CurrentUser() user?: JwtPayload) {
    return this.customerRequirementsService.create(dto, actorUserId(user));
  }

  @RequirePermissions('customerRequirements:update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerRequirementDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.customerRequirementsService.update(id, dto, actorUserId(user));
  }

  @RequirePermissions('customerRequirements:delete')
  @Delete(':id')
  @ApiOkResponse({ description: 'Cancel customer requirement (set status to 已取消)' })
  remove(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    return this.customerRequirementsService.remove(id, actorUserId(user));
  }
}
