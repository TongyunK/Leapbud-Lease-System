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
} from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { WhatsappTemplateCategoriesService } from './whatsapp-template-categories.service'
import {
  CreateWhatsappTemplateCategoryDto,
  ReorderWhatsappTemplateCategoriesDto,
  UpdateWhatsappTemplateCategoryDto,
} from './dto/whatsapp-template-category.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { PermissionsGuard } from '../permissions/permissions.guard'
import { RequirePermissions } from '../permissions/require-permissions.decorator'
import { CurrentUser, actorUserId } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/jwt-auth.guard'
import { BatchDeleteDto } from '../common/batch-delete'

@ApiTags('whatsapp-template-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.user)
@Controller('whatsapp-template-categories')
export class WhatsappTemplateCategoriesController {
  constructor(private readonly service: WhatsappTemplateCategoriesService) {}

  @Get()
  @ApiQuery({ name: 'activeOnly', required: false })
  @ApiOkResponse({ description: 'WhatsApp template categories' })
  findAll(@Query('activeOnly') activeOnly?: string) {
    const onlyActive = activeOnly === undefined ? true : activeOnly !== 'false'
    return this.service.findAll({ activeOnly: onlyActive })
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Post('batch-delete')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('systemSettings:update')
  @ApiOkResponse({ description: 'Batch delete WhatsApp template categories' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.service.removeMany(dto.ids)
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('systemSettings:update')
  create(@Body() dto: CreateWhatsappTemplateCategoryDto, @CurrentUser() user?: JwtPayload) {
    return this.service.create(dto, actorUserId(user))
  }

  @Patch('reorder')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('systemSettings:update')
  @ApiOkResponse({ description: 'Batch update WhatsApp template category sortOrder' })
  reorder(@Body() dto: ReorderWhatsappTemplateCategoriesDto, @CurrentUser() user?: JwtPayload) {
    return this.service.reorder(dto, actorUserId(user))
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('systemSettings:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWhatsappTemplateCategoryDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.service.update(id, dto, actorUserId(user))
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('systemSettings:update')
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
