import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BuildingsService } from './buildings.service';
import { UpdateBuildingDto } from './dto/building.dto';
import { JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, actorAccount } from '../auth/current-user.decorator';

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

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBuildingDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.buildingsService.update(id, dto, actorAccount(user));
  }
}
