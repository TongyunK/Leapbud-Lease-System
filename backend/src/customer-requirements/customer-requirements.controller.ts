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
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { parseSortDir, splitCsv } from '../common/pagination';

@ApiTags('customer-requirements')
@Controller('customer-requirements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.user)
export class CustomerRequirementsController {
  constructor(private readonly customerRequirementsService: CustomerRequirementsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'statuses', required: false, description: 'Comma-separated statuses' })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'customerNames', required: false })
  @ApiQuery({ name: 'salesManagers', required: false })
  @ApiQuery({ name: 'sizeConfigLabels', required: false })
  @ApiQuery({ name: 'acConfigLabels', required: false })
  @ApiQuery({ name: 'windowConfigLabels', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'requirementDateFrom', required: false })
  @ApiQuery({ name: 'requirementDateTo', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated customer requirement list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('statuses') statuses?: string,
    @Query('customerId') customerId?: string,
    @Query('customerNames') customerNames?: string,
    @Query('salesManagers') salesManagers?: string,
    @Query('sizeConfigLabels') sizeConfigLabels?: string,
    @Query('acConfigLabels') acConfigLabels?: string,
    @Query('windowConfigLabels') windowConfigLabels?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('requirementDateFrom') requirementDateFrom?: string,
    @Query('requirementDateTo') requirementDateTo?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.customerRequirementsService.findAll({
      keyword,
      status,
      statuses: splitCsv(statuses),
      customerId,
      customerNames: splitCsv(customerNames),
      salesManagers: splitCsv(salesManagers),
      sizeConfigLabels: splitCsv(sizeConfigLabels),
      acConfigLabels: splitCsv(acConfigLabels),
      windowConfigLabels: splitCsv(windowConfigLabels),
      sortBy,
      sortDir: parseSortDir(sortDir),
      requirementDateFrom,
      requirementDateTo,
      createdAtFrom,
      createdAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customerRequirementsService.findOne(id);
  }

  @Post('import')
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Batch import customer requirements (upsert by requirementCode)' })
  importBatch(@Body() dto: ImportCustomerRequirementsDto, @CurrentUser() user?: JwtPayload) {
    return this.customerRequirementsService.importBatch(dto, actorUserId(user));
  }

  @Post()
  @Roles(UserRole.admin)
  create(@Body() dto: CreateCustomerRequirementDto, @CurrentUser() user?: JwtPayload) {
    return this.customerRequirementsService.create(dto, actorUserId(user));
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerRequirementDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.customerRequirementsService.update(id, dto, actorUserId(user));
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.customerRequirementsService.remove(id);
  }
}
