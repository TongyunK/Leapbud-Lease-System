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
import { ContractOtherFeesService } from './contract-other-fees.service';
import {
  CreateContractOtherFeeDto,
  ImportContractOtherFeesDto,
  UpdateContractOtherFeeDto,
} from './dto/contract-other-fee.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { BatchDeleteDto } from '../common/batch-delete';
import { splitCsv } from '../common/pagination';

@ApiTags('contract-other-fees')
@Controller('contract-other-fees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class ContractOtherFeesController {
  constructor(private readonly contractOtherFeesService: ContractOtherFeesService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'customerNames', required: false, description: 'Comma-separated customer names' })
  @ApiQuery({ name: 'terminationId', required: false })
  @ApiQuery({
    name: 'linkedToTermination',
    required: false,
    description: 'true = only fees linked to a lease termination (deposit deductions)',
  })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated contract other fee list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('contractId') contractId?: string,
    @Query('customerNames') customerNames?: string,
    @Query('terminationId') terminationId?: string,
    @Query('linkedToTermination') linkedToTermination?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.contractOtherFeesService.findAll({
      keyword,
      contractId,
      customerNames: splitCsv(customerNames),
      terminationId,
      linkedToTermination:
        linkedToTermination === '1' ||
        linkedToTermination === 'true' ||
        linkedToTermination === 'yes',
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      createdAtFrom,
      createdAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @RequirePermissions('contractOtherFees:import', 'depositDeductions:import')
  @Post('import')
  @ApiOkResponse({ description: 'Batch import contract other fees / deposit deductions' })
  importBatch(@Body() dto: ImportContractOtherFeesDto, @CurrentUser() user?: JwtPayload) {
    return this.contractOtherFeesService.importBatch(dto, actorUserId(user));
  }

  @RequirePermissions('contractOtherFees:batchDelete', 'depositDeductions:batchDelete')
  @Post('batch-delete')
  @ApiOkResponse({ description: 'Batch delete contract other fees by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.contractOtherFeesService.removeMany(dto.ids);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractOtherFeesService.findOne(id);
  }

  @RequirePermissions('contractOtherFees:create', 'depositDeductions:create')
  @Post()
  create(@Body() dto: CreateContractOtherFeeDto, @CurrentUser() user?: JwtPayload) {
    return this.contractOtherFeesService.create(dto, actorUserId(user));
  }

  @RequirePermissions('contractOtherFees:update', 'depositDeductions:update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContractOtherFeeDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.contractOtherFeesService.update(id, dto, actorUserId(user));
  }

  @RequirePermissions('contractOtherFees:delete', 'depositDeductions:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contractOtherFeesService.remove(id);
  }
}
