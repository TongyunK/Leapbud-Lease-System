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
import { RoomConfigsService } from './room-configs.service';
import { CreateRoomConfigDto, UpdateRoomConfigDto } from './dto/room-config.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, actorAccount } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';

@ApiTags('room-configs')
@Controller('room-configs')
export class RoomConfigsController {
  constructor(private readonly roomConfigsService: RoomConfigsService) {}

  /** 业务表单下拉：默认只返回启用项；管理员可传 activeOnly=false 看全部 */
  @Get()
  @ApiQuery({ name: 'type', required: false, enum: ['size', 'window', 'ac'] })
  @ApiQuery({ name: 'activeOnly', required: false })
  @ApiOkResponse({ description: 'Room config options' })
  findAll(
    @Query('type') type?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const onlyActive = activeOnly === undefined ? true : activeOnly !== 'false';
    return this.roomConfigsService.findAll({ type, activeOnly: onlyActive });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roomConfigsService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  create(@Body() dto: CreateRoomConfigDto, @CurrentUser() user?: JwtPayload) {
    return this.roomConfigsService.create(dto, actorAccount(user));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomConfigDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.roomConfigsService.update(id, dto, actorAccount(user));
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.roomConfigsService.remove(id);
  }
}
