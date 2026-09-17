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
import { CreateContractDto, UpdateContractDto, ImportContractsDto } from './dto/contract.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { parseSortDir, splitCsv } from '../common/pagination';
import { BatchDeleteDto } from '../common/batch-delete';

@ApiTags('contracts')
@Controller('contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
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
  @ApiQuery({ name: 'roomCodes', required: false, description: 'Comma-separated room codes' })
  @ApiQuery({ name: 'customerNames', required: false, description: 'Comma-separated customer names' })
  @ApiQuery({ name: 'salesManagers', required: false, description: 'Comma-separated sales manager labels' })
  @ApiQuery({ name: 'leaseTypes', required: false, description: 'Comma-separated lease types' })
  @ApiQuery({ name: 'paymentCycles', required: false, description: 'Comma-separated payment cycles' })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'startDateFrom', required: false })
  @ApiQuery({ name: 'startDateTo', required: false })
  @ApiQuery({ name: 'endDateFrom', required: false })
  @ApiQuery({ name: 'endDateTo', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
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
    @Query('roomCodes') roomCodes?: string,
    @Query('customerNames') customerNames?: string,
    @Query('salesManagers') salesManagers?: string,
    @Query('leaseTypes') leaseTypes?: string,
    @Query('paymentCycles') paymentCycles?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('startDateFrom') startDateFrom?: string,
    @Query('startDateTo') startDateTo?: string,
    @Query('endDateFrom') endDateFrom?: string,
    @Query('endDateTo') endDateTo?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.contractsService.findAll({
      keyword,
      status,
      statuses: splitCsv(statuses),
      customerId,
      roomId,
      requirementId,
      roomCodes: splitCsv(roomCodes),
      customerNames: splitCsv(customerNames),
      salesManagers: splitCsv(salesManagers),
      leaseTypes: splitCsv(leaseTypes),
      paymentCycles: splitCsv(paymentCycles),
      sortBy,
      sortDir: parseSortDir(sortDir),
      startDateFrom,
      startDateTo,
      endDateFrom,
      endDateTo,
      createdAtFrom,
      createdAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post('import')
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Batch import contracts' })
  importBatch(@Body() dto: ImportContractsDto, @CurrentUser() user?: JwtPayload) {
    return this.contractsService.importBatch(dto, actorUserId(user));
  }

  @Post('batch-delete')
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Batch delete contracts by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.contractsService.removeMany(dto.ids);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.admin)
  create(@Body() dto: CreateContractDto, @CurrentUser() user?: JwtPayload) {
    return this.contractsService.create(dto, actorUserId(user));
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.contractsService.update(id, dto, actorUserId(user));
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.contractsService.remove(id);
  }
}
