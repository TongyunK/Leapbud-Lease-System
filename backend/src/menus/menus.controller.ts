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
import { MenusService } from './menus.service';
import { CreateMenuDto, ReorderMenusDto, UpdateMenuDto } from './dto/menu.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';

@ApiTags('menus')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('menus')
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  /** 当前登录用户侧栏菜单（按角色权限） */
  @Get('nav')
  @Roles(UserRole.admin, UserRole.user)
  @ApiOkResponse({ description: 'Nav menu tree for current role' })
  findNav(@CurrentUser() user?: JwtPayload) {
    return this.menusService.findNavTreeForRole(user?.role || '');
  }

  @Get()
  @Roles(UserRole.admin, UserRole.user)
  @ApiQuery({ name: 'activeOnly', required: false })
  @ApiQuery({ name: 'flat', required: false, description: 'true=扁平列表，默认树' })
  @ApiOkResponse({ description: 'Menu tree or flat list' })
  findAll(
    @Query('activeOnly') activeOnly?: string,
    @Query('flat') flat?: string,
  ) {
    return this.menusService.findAll({
      activeOnly: activeOnly === 'true',
      flat: flat === 'true',
    });
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.user)
  findOne(@Param('id') id: string) {
    return this.menusService.findOne(id);
  }

  @RequirePermissions('menus:create')
  @Roles(UserRole.admin, UserRole.user)
  @Post()
  create(@Body() dto: CreateMenuDto, @CurrentUser() user?: JwtPayload) {
    return this.menusService.create(dto, actorUserId(user));
  }

  @RequirePermissions('menus:update')
  @Roles(UserRole.admin, UserRole.user)
  @Patch('reorder')
  @ApiOkResponse({ description: 'Batch update menu sortOrder (same parent)' })
  reorder(@Body() dto: ReorderMenusDto, @CurrentUser() user?: JwtPayload) {
    return this.menusService.reorder(dto, actorUserId(user));
  }

  @RequirePermissions('menus:update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMenuDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.menusService.update(id, dto, actorUserId(user));
  }

  @RequirePermissions('menus:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.menusService.remove(id);
  }
}
