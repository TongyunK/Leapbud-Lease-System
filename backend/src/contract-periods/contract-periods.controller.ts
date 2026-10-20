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
import { ContractPeriodsService } from './contract-periods.service';
import {
  CreateContractPeriodDto,
  ImportContractPeriodsDto,
  UpdateContractPeriodDto,
} from './dto/contract-period.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { BatchDeleteDto } from '../common/batch-delete';
import { splitCsv } from '../common/pagination';

@ApiTags('contract-periods')
@Controller('contract-periods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class ContractPeriodsController {
  constructor(private readonly contractPeriodsService: ContractPeriodsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'customerNames', required: false, description: 'Comma-separated customer names' })
  @ApiQuery({ name: 'dateTypes', required: false, description: 'Comma-separated dateType labels' })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'startDateFrom', required: false })
  @ApiQuery({ name: 'startDateTo', required: false })
  @ApiQuery({ name: 'endDateFrom', required: false })
  @ApiQuery({ name: 'endDateTo', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'updatedAtFrom', required: false })
  @ApiQuery({ name: 'updatedAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated contract period list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('contractId') contractId?: string,
    @Query('customerNames') customerNames?: string,
    @Query('dateTypes') dateTypes?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('startDateFrom') startDateFrom?: string,
    @Query('startDateTo') startDateTo?: string,
    @Query('endDateFrom') endDateFrom?: string,
    @Query('endDateTo') endDateTo?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('updatedAtFrom') updatedAtFrom?: string,
    @Query('updatedAtTo') updatedAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.contractPeriodsService.findAll({
      keyword,
      contractId,
      customerNames: splitCsv(customerNames),
      dateTypes: dateTypes
        ? dateTypes
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : undefined,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      startDateFrom,
      startDateTo,
      endDateFrom,
      endDateTo,
      createdAtFrom,
      createdAtTo,
      updatedAtFrom,
      updatedAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @RequirePermissions('contractPeriods:import')
  @Post('import')
  @ApiOkResponse({ description: 'Batch import contract periods' })
  importBatch(@Body() dto: ImportContractPeriodsDto) {
    return this.contractPeriodsService.importBatch(dto);
  }

  @RequirePermissions('contractPeriods:batchDelete')
  @Post('batch-delete')
  @ApiOkResponse({ description: 'Batch delete contract periods by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.contractPeriodsService.removeMany(dto.ids);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractPeriodsService.findOne(id);
  }

  @RequirePermissions('contractPeriods:create')
  @Post()
  create(@Body() dto: CreateContractPeriodDto) {
    return this.contractPeriodsService.create(dto);
  }

  @RequirePermissions('contractPeriods:update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContractPeriodDto) {
    return this.contractPeriodsService.update(id, dto);
  }

  @RequirePermissions('contractPeriods:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contractPeriodsService.remove(id);
  }
}
