import {
  Body,
  Controller,
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
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import { parseSortDir, splitCsv } from '../common/pagination';

@ApiTags('buildings')
@Controller('buildings')
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Get()
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
  findOne(@Param('id') id: string) {
    return this.buildingsService.findOne(id);
  }

  @Post('import')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Batch import buildings (upsert by name)' })
  importBatch(@Body() dto: ImportBuildingsDto, @CurrentUser() user?: JwtPayload) {
    return this.buildingsService.importBatch(dto, actorUserId(user));
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  create(@Body() dto: CreateBuildingDto, @CurrentUser() user?: JwtPayload) {
    return this.buildingsService.create(dto, actorUserId(user));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBuildingDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.buildingsService.update(id, dto, actorUserId(user));
  }
}
