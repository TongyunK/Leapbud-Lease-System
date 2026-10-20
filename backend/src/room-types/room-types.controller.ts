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
import { RoomTypesService } from './room-types.service';
import { CreateRoomTypeDto, UpdateRoomTypeDto } from './dto/room-type.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { BatchDeleteDto } from '../common/batch-delete';

@ApiTags('room-types')
@Controller('room-types')
export class RoomTypesController {
  constructor(private readonly roomTypesService: RoomTypesService) {}

  @Get()
  @ApiQuery({ name: 'activeOnly', required: false })
  @ApiOkResponse({ description: 'Room type options' })
  findAll(@Query('activeOnly') activeOnly?: string) {
    const onlyActive = activeOnly === undefined ? true : activeOnly !== 'false';
    return this.roomTypesService.findAll({ activeOnly: onlyActive });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roomTypesService.findOne(id);
  }

  @Post('batch-delete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('roomTypes:batchDelete')
  @ApiOkResponse({ description: 'Batch delete room types by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.roomTypesService.removeMany(dto.ids);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('roomTypes:create')
  create(@Body() dto: CreateRoomTypeDto, @CurrentUser() user?: JwtPayload) {
    return this.roomTypesService.create(dto, actorUserId(user));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('roomTypes:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomTypeDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.roomTypesService.update(id, dto, actorUserId(user));
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('roomTypes:delete')
  remove(@Param('id') id: string) {
    return this.roomTypesService.remove(id);
  }
}
