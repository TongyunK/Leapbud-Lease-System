import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { BatchDeleteDto } from '../common/batch-delete';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiOkResponse({ description: 'User list（客户经理等下拉选项；读写分离）' })
  findAll(@Query('keyword') keyword?: string) {
    return this.usersService.findAll(keyword);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @RequirePermissions('users:batchDelete')
  @Post('batch-delete')
  @ApiOkResponse({ description: 'Batch delete users by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.usersService.removeMany(dto.ids);
  }

  @RequirePermissions('users:create')
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user?: JwtPayload) {
    return this.usersService.create(dto, actorUserId(user));
  }

  @RequirePermissions('users:update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.usersService.update(id, dto, actorUserId(user));
  }

  @RequirePermissions('users:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
