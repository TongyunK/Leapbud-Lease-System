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
import { OccupantsService } from './occupants.service';
import {
  CreateOccupantDto,
  ImportOccupantsDto,
  UpdateOccupantDto,
} from './dto/occupant.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';

@ApiTags('occupants')
@Controller('occupants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.user)
export class OccupantsController {
  constructor(private readonly occupantsService: OccupantsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'limit', required: false, description: 'Max rows (cap 200)' })
  @ApiQuery({
    name: 'lite',
    required: false,
    description: 'Lightweight fields for dropdowns',
  })
  @ApiOkResponse({ description: 'Occupant (使用者) list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('customerId') customerId?: string,
    @Query('limit') limit?: string,
    @Query('lite') lite?: string,
  ) {
    const n = limit ? Number(limit) : undefined;
    return this.occupantsService.findAll({
      keyword,
      customerId,
      limit: Number.isFinite(n) ? n : undefined,
      lite: lite === '1' || lite === 'true',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.occupantsService.findOne(id);
  }

  @Post('import')
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Batch import occupants (skip duplicates)' })
  importBatch(@Body() dto: ImportOccupantsDto, @CurrentUser() user?: JwtPayload) {
    return this.occupantsService.importBatch(dto, actorUserId(user));
  }

  @Post()
  @Roles(UserRole.admin)
  create(@Body() dto: CreateOccupantDto, @CurrentUser() user?: JwtPayload) {
    return this.occupantsService.create(dto, actorUserId(user));
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOccupantDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.occupantsService.update(id, dto, actorUserId(user));
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.occupantsService.remove(id);
  }
}
