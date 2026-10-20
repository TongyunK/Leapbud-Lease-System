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
import { LeaseTerminationsService } from './lease-terminations.service';
import {
  CreateLeaseTerminationDto,
  ImportLeaseTerminationsDto,
  UpdateLeaseTerminationDto,
} from './dto/lease-termination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { BatchDeleteDto } from '../common/batch-delete';
import { splitCsv } from '../common/pagination';

@ApiTags('lease-terminations')
@Controller('lease-terminations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class LeaseTerminationsController {
  constructor(private readonly leaseTerminationsService: LeaseTerminationsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'roomId', required: false })
  @ApiQuery({ name: 'customerNames', required: false, description: 'Comma-separated customer names' })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'terminationDateFrom', required: false })
  @ApiQuery({ name: 'terminationDateTo', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated lease termination list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('contractId') contractId?: string,
    @Query('customerId') customerId?: string,
    @Query('roomId') roomId?: string,
    @Query('customerNames') customerNames?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('terminationDateFrom') terminationDateFrom?: string,
    @Query('terminationDateTo') terminationDateTo?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.leaseTerminationsService.findAll({
      keyword,
      contractId,
      customerId,
      roomId,
      customerNames: splitCsv(customerNames),
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      terminationDateFrom,
      terminationDateTo,
      createdAtFrom,
      createdAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @RequirePermissions('leaseTerminations:import')
  @Post('import')
  @ApiOkResponse({ description: 'Batch import lease terminations' })
  importBatch(@Body() dto: ImportLeaseTerminationsDto, @CurrentUser() user?: JwtPayload) {
    return this.leaseTerminationsService.importBatch(dto, actorUserId(user));
  }

  @RequirePermissions('leaseTerminations:batchDelete')
  @Post('batch-delete')
  @ApiOkResponse({ description: 'Batch delete lease terminations by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.leaseTerminationsService.removeMany(dto.ids);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leaseTerminationsService.findOne(id);
  }

  @RequirePermissions('leaseTerminations:create')
  @Post()
  create(@Body() dto: CreateLeaseTerminationDto, @CurrentUser() user?: JwtPayload) {
    return this.leaseTerminationsService.create(dto, actorUserId(user));
  }

  @RequirePermissions('leaseTerminations:update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeaseTerminationDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.leaseTerminationsService.update(id, dto, actorUserId(user));
  }

  @RequirePermissions('leaseTerminations:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.leaseTerminationsService.remove(id);
  }
}
