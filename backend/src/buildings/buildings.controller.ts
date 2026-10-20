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
import { BuildingsService } from './buildings.service';
import {
  CreateBuildingDto,
  ImportBuildingsDto,
  UpdateBuildingDto,
} from './dto/building.dto';
import { JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import { parseSortDir, splitCsv } from '../common/pagination';
import { BatchDeleteDto } from '../common/batch-delete';

@ApiTags('buildings')
@Controller('buildings')
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.admin, UserRole.user)
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'activeOnly', required: false })
  @ApiQuery({ name: 'managers', required: false, description: 'Comma-separated manager names' })
  @ApiQuery({ name: 'active', required: false, description: 'Comma-separated true/false' })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'updatedAtFrom', required: false })
  @ApiQuery({ name: 'updatedAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated building list (omit pageSize to return all)' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('managers') managers?: string,
    @Query('active') active?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('updatedAtFrom') updatedAtFrom?: string,
    @Query('updatedAtTo') updatedAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const onlyActive = activeOnly === undefined ? false : activeOnly !== 'false';
    return this.buildingsService.findAll({
      keyword,
      activeOnly: onlyActive,
      managers: splitCsv(managers),
      active: splitCsv(active),
      sortBy,
      sortDir: parseSortDir(sortDir),
      createdAtFrom,
      createdAtTo,
      updatedAtFrom,
      updatedAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.admin, UserRole.user)
  findOne(@Param('id') id: string) {
    return this.buildingsService.findOne(id);
  }

  @Post('import')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('buildings:import')
  @ApiOkResponse({ description: 'Batch import buildings (upsert by name)' })
  importBatch(@Body() dto: ImportBuildingsDto, @CurrentUser() user?: JwtPayload) {
    return this.buildingsService.importBatch(dto, actorUserId(user));
  }

  @Post('batch-delete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('buildings:batchDelete')
  @ApiOkResponse({ description: 'Batch delete buildings by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.buildingsService.removeMany(dto.ids);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('buildings:create')
  create(@Body() dto: CreateBuildingDto, @CurrentUser() user?: JwtPayload) {
    return this.buildingsService.create(dto, actorUserId(user));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('buildings:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBuildingDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.buildingsService.update(id, dto, actorUserId(user));
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('buildings:delete')
  remove(@Param('id') id: string) {
    return this.buildingsService.remove(id);
  }
}
