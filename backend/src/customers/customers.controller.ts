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
import { CustomersService } from './customers.service';
import { CreateCustomerDto, ImportCustomersDto, UpdateCustomerDto } from './dto/customer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { parseSortDir, splitCsv } from '../common/pagination';
import { BatchDeleteDto } from '../common/batch-delete';

@ApiTags('customers')
@Controller('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'statuses', required: false, description: 'Comma-separated statuses' })
  @ApiQuery({ name: 'accountManagers', required: false, description: 'Comma-separated manager labels' })
  @ApiQuery({ name: 'buildingNames', required: false, description: 'Comma-separated building names' })
  @ApiQuery({ name: 'names', required: false, description: 'Comma-separated customer names' })
  @ApiQuery({ name: 'primaryContacts', required: false, description: 'Comma-separated primary contact names' })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated customer list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('statuses') statuses?: string,
    @Query('accountManagers') accountManagers?: string,
    @Query('buildingNames') buildingNames?: string,
    @Query('names') names?: string,
    @Query('primaryContacts') primaryContacts?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.customersService.findAll({
      keyword,
      status,
      statuses: splitCsv(statuses),
      accountManagers: splitCsv(accountManagers),
      buildingNames: splitCsv(buildingNames),
      names: splitCsv(names),
      primaryContacts: splitCsv(primaryContacts),
      sortBy,
      sortDir: parseSortDir(sortDir),
      createdAtFrom,
      createdAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('code-preview')
  @ApiOkResponse({ description: 'Preview next customer code without consuming sequence' })
  previewCode() {
    return this.customersService.previewCustomerCode();
  }

  @Get(':id/past-occupants')
  @ApiOkResponse({ description: 'Past occupants previously affiliated with this customer' })
  listPastOccupants(@Param('id') id: string) {
    return this.customersService.listPastOccupants(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @RequirePermissions('customers:import')
  @Post('import')
  @ApiOkResponse({ description: 'Batch import customers (upsert by customerCode)' })
  importBatch(@Body() dto: ImportCustomersDto, @CurrentUser() user?: JwtPayload) {
    return this.customersService.importBatch(dto, actorUserId(user));
  }

  @RequirePermissions('customers:batchDelete')
  @Post('batch-delete')
  @ApiOkResponse({ description: 'Batch delete customers by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.customersService.removeMany(dto.ids);
  }

  @RequirePermissions('customers:create')
  @Post()
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user?: JwtPayload) {
    return this.customersService.create(dto, actorUserId(user));
  }

  @RequirePermissions('customers:update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.customersService.update(id, dto, actorUserId(user));
  }

  @RequirePermissions('customers:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }
}
