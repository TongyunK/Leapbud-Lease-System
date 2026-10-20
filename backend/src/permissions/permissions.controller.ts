import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';

@ApiTags('permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get('mine')
  @Roles(UserRole.admin, UserRole.user)
  @ApiOkResponse({ description: 'Current user permission codes' })
  async mine(@CurrentUser() user?: JwtPayload) {
    const role = (user?.role || '').trim();
    const codes = role ? await this.permissionsService.getCodesForRole(role) : [];
    const adminExclusiveCodes =
      role === 'admin' ? await this.permissionsService.getAdminExclusiveCodes() : [];
    return { codes, adminExclusiveCodes };
  }

  @Get('catalog')
  @Roles(UserRole.admin, UserRole.user)
  @ApiOkResponse({ description: 'Permission catalog grouped by module' })
  catalog() {
    return this.permissionsService.catalogGrouped();
  }
}
