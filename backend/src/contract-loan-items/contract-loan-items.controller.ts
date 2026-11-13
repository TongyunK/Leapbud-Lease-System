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
import { ContractLoanItemsService } from './contract-loan-items.service';
import {
  CreateContractLoanItemDto,
  ImportContractLoanItemsDto,
  UpdateContractLoanItemDto,
} from './dto/contract-loan-item.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { BatchDeleteDto } from '../common/batch-delete';
import { splitCsv } from '../common/pagination';

@ApiTags('contract-loan-items')
@Controller('contract-loan-items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class ContractLoanItemsController {
  constructor(private readonly contractLoanItemsService: ContractLoanItemsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'contractCodes', required: false })
  @ApiQuery({ name: 'customerNames', required: false, description: 'Comma-separated customer names' })
  @ApiQuery({ name: 'quantities', required: false })
  @ApiQuery({ name: 'unitAmounts', required: false })
  @ApiQuery({ name: 'subtotals', required: false })
  @ApiQuery({ name: 'roomCodes', required: false })
  @ApiQuery({ name: 'createdBys', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated contract loan item list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('contractId') contractId?: string,
    @Query('contractCodes') contractCodes?: string,
    @Query('customerNames') customerNames?: string,
    @Query('quantities') quantities?: string,
    @Query('unitAmounts') unitAmounts?: string,
    @Query('subtotals') subtotals?: string,
    @Query('roomCodes') roomCodes?: string,
    @Query('createdBys') createdBys?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.contractLoanItemsService.findAll({
      keyword,
      contractId,
      contractCodes: splitCsv(contractCodes),
      customerNames: splitCsv(customerNames),
      quantities: splitCsv(quantities),
      unitAmounts: splitCsv(unitAmounts),
      subtotals: splitCsv(subtotals),
      roomCodes: splitCsv(roomCodes),
      createdBys: splitCsv(createdBys),
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      createdAtFrom,
      createdAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @RequirePermissions('contractLoanItems:import')
  @Post('import')
  @ApiOkResponse({ description: 'Batch import contract loan items' })
  importBatch(@Body() dto: ImportContractLoanItemsDto, @CurrentUser() user?: JwtPayload) {
    return this.contractLoanItemsService.importBatch(dto, actorUserId(user));
  }

  @RequirePermissions('contractLoanItems:batchDelete')
  @Post('batch-delete')
  @ApiOkResponse({ description: 'Batch delete contract loan items by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.contractLoanItemsService.removeMany(dto.ids);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractLoanItemsService.findOne(id);
  }

  @RequirePermissions('contractLoanItems:create')
  @Post()
  create(@Body() dto: CreateContractLoanItemDto, @CurrentUser() user?: JwtPayload) {
    return this.contractLoanItemsService.create(dto, actorUserId(user));
  }

  @RequirePermissions('contractLoanItems:update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContractLoanItemDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.contractLoanItemsService.update(id, dto, actorUserId(user));
  }

  @RequirePermissions('contractLoanItems:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contractLoanItemsService.remove(id);
  }
}
