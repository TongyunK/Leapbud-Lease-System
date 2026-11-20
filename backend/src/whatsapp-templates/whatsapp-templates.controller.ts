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
import { WhatsappTemplatesService } from './whatsapp-templates.service'
import {
  CreateWhatsappTemplateDto,
  ReorderWhatsappTemplatesDto,
  UpdateWhatsappTemplateDto,
} from './dto/whatsapp-template.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { PermissionsGuard } from '../permissions/permissions.guard'
import { RequirePermissions } from '../permissions/require-permissions.decorator'
import { CurrentUser, actorUserId } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/jwt-auth.guard'
import { BatchDeleteDto } from '../common/batch-delete'

@ApiTags('whatsapp-templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.user)
@Controller('whatsapp-templates')
export class WhatsappTemplatesController {
  constructor(private readonly service: WhatsappTemplatesService) {}

  @Get()
  @ApiQuery({ name: 'activeOnly', required: false })
  @ApiQuery({ name: 'buildingId', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiOkResponse({ description: 'WhatsApp templates' })
  findAll(
    @Query('activeOnly') activeOnly?: string,
    @Query('buildingId') buildingId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    const onlyActive = activeOnly === undefined ? true : activeOnly !== 'false'
    return this.service.findAll({
      activeOnly: onlyActive,
      buildingId: buildingId?.trim() || undefined,
      categoryId: categoryId?.trim() || undefined,
    })
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Post('batch-delete')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('systemSettings:update')
  @ApiOkResponse({ description: 'Batch delete WhatsApp templates' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.service.removeMany(dto.ids)
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('systemSettings:update')
  create(@Body() dto: CreateWhatsappTemplateDto, @CurrentUser() user?: JwtPayload) {
    return this.service.create(dto, actorUserId(user))
  }

  @Patch('reorder')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('systemSettings:update')
  @ApiOkResponse({ description: 'Batch update WhatsApp template sortOrder' })
  reorder(@Body() dto: ReorderWhatsappTemplatesDto, @CurrentUser() user?: JwtPayload) {
    return this.service.reorder(dto, actorUserId(user))
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('systemSettings:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWhatsappTemplateDto,
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
