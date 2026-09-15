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
import { ContractConfigsService } from './contract-configs.service';
import { CreateContractConfigDto, UpdateContractConfigDto } from './dto/contract-config.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { BatchDeleteDto } from '../common/batch-delete';

@ApiTags('contract-configs')
@Controller('contract-configs')
export class ContractConfigsController {
  constructor(private readonly contractConfigsService: ContractConfigsService) {}

  @Get()
  @ApiQuery({ name: 'type', required: false, enum: ['periodType', 'leaseType', 'keyDeposit'] })
  @ApiQuery({ name: 'activeOnly', required: false })
  @ApiOkResponse({ description: 'Contract config options' })
  findAll(
    @Query('type') type?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const onlyActive = activeOnly === undefined ? true : activeOnly !== 'false';
    return this.contractConfigsService.findAll({ type, activeOnly: onlyActive });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractConfigsService.findOne(id);
  }

  @Post('batch-delete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Batch delete contract configs by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.contractConfigsService.removeMany(dto.ids);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  create(@Body() dto: CreateContractConfigDto, @CurrentUser() user?: JwtPayload) {
    return this.contractConfigsService.create(dto, actorUserId(user));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContractConfigDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.contractConfigsService.update(id, dto, actorUserId(user));
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.contractConfigsService.remove(id);
  }
}
