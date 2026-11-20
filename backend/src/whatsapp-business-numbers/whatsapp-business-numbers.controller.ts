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
import { WhatsappBusinessNumbersService } from './whatsapp-business-numbers.service'
import {
  CreateWhatsappBusinessNumberDto,
  ReorderWhatsappBusinessNumbersDto,
  UpdateWhatsappBusinessNumberDto,
} from './dto/whatsapp-business-number.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { PermissionsGuard } from '../permissions/permissions.guard'
import { RequirePermissions } from '../permissions/require-permissions.decorator'
import { CurrentUser, actorUserId } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/jwt-auth.guard'
import { BatchDeleteDto } from '../common/batch-delete'

@ApiTags('whatsapp-business-numbers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.user)
@Controller('whatsapp-business-numbers')
export class WhatsappBusinessNumbersController {
  constructor(private readonly service: WhatsappBusinessNumbersService) {}

  @Get()
  @ApiQuery({ name: 'activeOnly', required: false })
  @ApiOkResponse({ description: 'WhatsApp business numbers' })
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
  @ApiOkResponse({ description: 'Batch delete WhatsApp business numbers' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.service.removeMany(dto.ids)
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('systemSettings:update')
  create(@Body() dto: CreateWhatsappBusinessNumberDto, @CurrentUser() user?: JwtPayload) {
    return this.service.create(dto, actorUserId(user))
  }

  @Patch('reorder')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('systemSettings:update')
  @ApiOkResponse({ description: 'Batch update WhatsApp business number sortOrder' })
  reorder(@Body() dto: ReorderWhatsappBusinessNumbersDto, @CurrentUser() user?: JwtPayload) {
    return this.service.reorder(dto, actorUserId(user))
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('systemSettings:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWhatsappBusinessNumberDto,
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
