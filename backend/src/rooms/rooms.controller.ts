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
import { parseSortDir, splitCsv } from '../common/pagination';

@ApiTags('rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'buildingId', required: false })
  @ApiQuery({ name: 'buildingIds', required: false, description: 'Comma-separated building IDs' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'statuses', required: false, description: 'Comma-separated statuses' })
  @ApiQuery({ name: 'roomTypes', required: false })
  @ApiQuery({ name: 'sizeRangeIds', required: false })
  @ApiQuery({ name: 'windowConfigs', required: false })
  @ApiQuery({ name: 'acConfigs', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'updatedAtFrom', required: false })
  @ApiQuery({ name: 'updatedAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated room list (omit pageSize to return all)' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('buildingId') buildingId?: string,
    @Query('buildingIds') buildingIds?: string,
    @Query('status') status?: string,
    @Query('statuses') statuses?: string,
    @Query('roomTypes') roomTypes?: string,
    @Query('sizeRangeIds') sizeRangeIds?: string,
    @Query('windowConfigs') windowConfigs?: string,
    @Query('acConfigs') acConfigs?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('updatedAtFrom') updatedAtFrom?: string,
    @Query('updatedAtTo') updatedAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.roomsService.findAll({
      keyword,
      buildingId,
      buildingIds: splitCsv(buildingIds),
      status,
      statuses: splitCsv(statuses),
      roomTypes: splitCsv(roomTypes),
      sizeRangeIds: splitCsv(sizeRangeIds),
      windowConfigs: splitCsv(windowConfigs),
      acConfigs: splitCsv(acConfigs),
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
