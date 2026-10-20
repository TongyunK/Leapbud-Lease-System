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
import { NumberingRulesService } from './numbering-rules.service';
import { CreateNumberingRuleDto, UpdateNumberingRuleDto } from './dto/numbering-rule.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { BatchDeleteDto } from '../common/batch-delete';

@ApiTags('numbering-rules')
@Controller('numbering-rules')
export class NumberingRulesController {
  constructor(private readonly numberingRulesService: NumberingRulesService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.admin, UserRole.user)
  @ApiQuery({ name: 'activeOnly', required: false })
  @ApiOkResponse({ description: 'Numbering rules' })
  findAll(@Query('activeOnly') activeOnly?: string) {
    const onlyActive = activeOnly === undefined ? false : activeOnly !== 'false';
    return this.numberingRulesService.findAll({ activeOnly: onlyActive });
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.admin, UserRole.user)
  findOne(@Param('id') id: string) {
    return this.numberingRulesService.findOne(id);
  }

  @Post('batch-delete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('numberingRules:batchDelete')
  @ApiOkResponse({ description: 'Batch delete numbering rules by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.numberingRulesService.removeMany(dto.ids);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('numberingRules:create')
  create(@Body() dto: CreateNumberingRuleDto, @CurrentUser() user?: JwtPayload) {
    return this.numberingRulesService.create(dto, actorUserId(user));
  }

  @Post(':id/reset')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('numberingRules:update')
  @ApiOkResponse({ description: 'Reset sequence to start value' })
  reset(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    return this.numberingRulesService.reset(id, actorUserId(user));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('numberingRules:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNumberingRuleDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.numberingRulesService.update(id, dto, actorUserId(user));
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('numberingRules:delete')
  remove(@Param('id') id: string) {
    return this.numberingRulesService.remove(id);
  }
}
