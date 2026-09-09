import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, actorAccount } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiOkResponse({ description: 'User list (admin only)' })
  findAll(@Query('keyword') keyword?: string) {
    return this.usersService.findAll(keyword);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user?: JwtPayload) {
    return this.usersService.create(dto, actorAccount(user));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.usersService.update(id, dto, actorAccount(user));
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
