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
import { RoomsService } from './rooms.service';
import { CreateRoomDto, ImportRoomsDto, UpdateRoomDto } from './dto/room.dto';
import { JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';

@ApiTags('rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'buildingId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiOkResponse({ description: 'Room list aligned with frontend RoomRecord' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('buildingId') buildingId?: string,
    @Query('status') status?: string,
  ) {
    return this.roomsService.findAll({ keyword, buildingId, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roomsService.findOne(id);
  }

  @Post('import')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Batch import rooms (upsert by roomCode)' })
  importBatch(@Body() dto: ImportRoomsDto, @CurrentUser() user?: JwtPayload) {
    return this.roomsService.importBatch(dto, actorUserId(user));
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  create(@Body() dto: CreateRoomDto, @CurrentUser() user?: JwtPayload) {
    return this.roomsService.create(dto, actorUserId(user));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.roomsService.update(id, dto, actorUserId(user));
  }
}
