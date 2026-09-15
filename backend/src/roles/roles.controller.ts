import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RolesService } from './roles.service';
import { AssignRoleMenusDto, CreateRoleDto, SaveRoleMenuMatrixDto, UpdateRoleDto } from './dto/role.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { BatchDeleteDto } from '../common/batch-delete';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'activeOnly', required: false })
  @ApiOkResponse({ description: 'Role list (admin only)' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const onlyActive = activeOnly === 'true';
    return this.rolesService.findAll({ keyword, activeOnly: onlyActive });
  }

  @Get('menu-matrix')
  @ApiOkResponse({ description: 'Role × menu permission matrix' })
  getMenuMatrix() {
    return this.rolesService.getMenuMatrix();
  }

  @Put('menu-matrix')
  saveMenuMatrix(@Body() dto: SaveRoleMenuMatrixDto, @CurrentUser() user?: JwtPayload) {
    return this.rolesService.saveMenuMatrix(dto, actorUserId(user));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Get(':id/menus')
  getMenus(@Param('id') id: string) {
    return this.rolesService.getMenuIds(id);
  }

  @Put(':id/menus')
  assignMenus(
    @Param('id') id: string,
    @Body() dto: AssignRoleMenusDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.rolesService.assignMenus(id, dto, actorUserId(user));
  }

  @Post('batch-delete')
  @ApiOkResponse({ description: 'Batch delete roles by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.rolesService.removeMany(dto.ids);
  }

  @Post()
  create(@Body() dto: CreateRoleDto, @CurrentUser() user?: JwtPayload) {
    return this.rolesService.create(dto, actorUserId(user));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.rolesService.update(id, dto, actorUserId(user));
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
