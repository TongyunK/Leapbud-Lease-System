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

@ApiTags('buildings')
@Controller('buildings')
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'activeOnly', required: false })
  @ApiOkResponse({ description: 'Building list aligned with frontend BuildingRecord' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const onlyActive = activeOnly === undefined ? false : activeOnly !== 'false';
    return this.buildingsService.findAll({ keyword, activeOnly: onlyActive });
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
