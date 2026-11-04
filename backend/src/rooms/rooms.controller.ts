import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import { RoomsService } from './rooms.service';
import {
  BatchUpdateRoomsDto,
  CreateRoomDto,
  ImportRoomsDto,
  UpdateRoomDto,
} from './dto/room.dto';
import { BatchDeleteDto } from '../common/batch-delete';
import { JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import { parseSortDir, splitCsv } from '../common/pagination';

@ApiTags('rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get('stats/lease-capability')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.admin, UserRole.user)
  @ApiQuery({ name: 'buildingId', required: false })
  @ApiQuery({ name: 'buildingIds', required: false })
  @ApiOkResponse({ description: 'Room counts by lease capability' })
  countByLeaseCapability(
    @Query('buildingId') buildingId?: string,
    @Query('buildingIds') buildingIds?: string,
  ) {
    return this.roomsService.countByLeaseCapability({
      buildingId,
      buildingIds: splitCsv(buildingIds),
    });
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.admin, UserRole.user)
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'buildingId', required: false })
  @ApiQuery({ name: 'buildingIds', required: false, description: 'Comma-separated building IDs' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'statuses', required: false, description: 'Comma-separated statuses' })
  @ApiQuery({
    name: 'leaseCapability',
    required: false,
    description: 'whole_only | flexible | part_only',
  })
  @ApiQuery({
    name: 'leaseCapabilities',
    required: false,
    description: 'Comma-separated lease capabilities',
  })
  @ApiQuery({
    name: 'occupancySummaries',
    required: false,
    description: 'Comma-separated occupancy fill statuses: idle,whole,partial,full,short',
  })
  @ApiQuery({ name: 'roomCodes', required: false })
  @ApiQuery({ name: 'names', required: false })
  @ApiQuery({ name: 'monthlyRents', required: false })
  @ApiQuery({ name: 'dailyRents', required: false })
  @ApiQuery({ name: 'hourlyRents', required: false })
  @ApiQuery({ name: 'roomTypes', required: false })
  @ApiQuery({ name: 'sizeRangeIds', required: false })
  @ApiQuery({ name: 'windowConfigs', required: false })
  @ApiQuery({ name: 'acConfigs', required: false })
  @ApiQuery({
    name: 'allowShortTerm',
    required: false,
    description: 'true | false — filter rooms by short-term flag',
  })
  @ApiQuery({ name: 'createdBys', required: false })
  @ApiQuery({ name: 'updatedBys', required: false })
  @ApiQuery({ name: 'createdAtEmpty', required: false })
  @ApiQuery({ name: 'updatedAtEmpty', required: false })
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
    @Query('leaseCapability') leaseCapability?: string,
    @Query('leaseCapabilities') leaseCapabilities?: string,
    @Query('roomCodes') roomCodes?: string,
    @Query('names') names?: string,
    @Query('monthlyRents') monthlyRents?: string,
    @Query('dailyRents') dailyRents?: string,
    @Query('hourlyRents') hourlyRents?: string,
    @Query('occupancySummaries') occupancySummaries?: string,
    @Query('roomTypes') roomTypes?: string,
    @Query('sizeRangeIds') sizeRangeIds?: string,
    @Query('windowConfigs') windowConfigs?: string,
    @Query('acConfigs') acConfigs?: string,
    @Query('allowShortTerm') allowShortTerm?: string,
    @Query('createdBys') createdBys?: string,
    @Query('updatedBys') updatedBys?: string,
    @Query('createdAtEmpty') createdAtEmpty?: string,
    @Query('updatedAtEmpty') updatedAtEmpty?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('updatedAtFrom') updatedAtFrom?: string,
    @Query('updatedAtTo') updatedAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const shortTermRaw = (allowShortTerm ?? '').trim().toLowerCase();
    const allowShortTermFilter =
      shortTermRaw === 'true' || shortTermRaw === '1'
        ? true
        : shortTermRaw === 'false' || shortTermRaw === '0'
          ? false
          : undefined;
    const flag = (v?: string) =>
      ['1', 'true', 'yes'].includes(String(v || '').trim().toLowerCase());
    return this.roomsService.findAll({
      keyword,
      buildingId,
      buildingIds: splitCsv(buildingIds),
      status,
      statuses: splitCsv(statuses),
      leaseCapability,
      leaseCapabilities: splitCsv(leaseCapabilities),
      roomCodes: splitCsv(roomCodes),
      names: splitCsv(names),
      monthlyRents: splitCsv(monthlyRents),
      dailyRents: splitCsv(dailyRents),
      hourlyRents: splitCsv(hourlyRents),
      occupancySummaries: splitCsv(occupancySummaries),
      roomTypes: splitCsv(roomTypes),
      sizeRangeIds: splitCsv(sizeRangeIds),
      windowConfigs: splitCsv(windowConfigs),
      acConfigs: splitCsv(acConfigs),
      allowShortTerm: allowShortTermFilter,
      createdBys: splitCsv(createdBys),
      updatedBys: splitCsv(updatedBys),
      createdAtEmpty: flag(createdAtEmpty) || undefined,
      updatedAtEmpty: flag(updatedAtEmpty) || undefined,
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
    return this.roomsService.findOne(id);
  }

  @Post('import')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('rooms:import')
  @ApiOkResponse({ description: 'Batch import rooms (upsert by roomCode)' })
  importBatch(@Body() dto: ImportRoomsDto, @CurrentUser() user?: JwtPayload) {
    return this.roomsService.importBatch(dto, actorUserId(user));
  }

  @Post('batch-delete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('rooms:batchDelete')
  @ApiOkResponse({ description: 'Batch delete rooms by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.roomsService.removeMany(dto.ids);
  }

  /** 批量修改房间字段：仅 SuperAdmin */
  @Post('batch-update')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, SuperAdminGuard)
  @Roles(UserRole.admin, UserRole.user)
  @ApiOkResponse({ description: 'Batch update rooms (SuperAdmin only)' })
  batchUpdate(
    @Body() dto: BatchUpdateRoomsDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.roomsService.batchUpdate(dto, actorUserId(user));
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('rooms:create')
  create(@Body() dto: CreateRoomDto, @CurrentUser() user?: JwtPayload) {
    return this.roomsService.create(dto, actorUserId(user));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('rooms:update')
  @Roles(UserRole.admin, UserRole.user)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.roomsService.update(id, dto, actorUserId(user));
  }

  @Post(':id/images')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.admin, UserRole.user)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 30, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @RequirePermissions('rooms:update')
  @ApiOkResponse({ description: 'Upload one or more room images' })
  uploadImages(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.roomsService.uploadImages(id, files || [], actorUserId(user));
  }

  @Get(':id/images/:imageId/file')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.admin, UserRole.user)
  @ApiOkResponse({ description: 'Stream room image file' })
  getImageFile(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.roomsService.getImageFile(id, imageId);
  }

  @Delete(':id/images/:imageId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('rooms:update')
  @Roles(UserRole.admin, UserRole.user)
  @ApiOkResponse({ description: 'Delete one room image' })
  removeImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.roomsService.removeImage(id, imageId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('rooms:delete')
  @Roles(UserRole.admin, UserRole.user)
  remove(@Param('id') id: string) {
    return this.roomsService.remove(id);
  }
}
