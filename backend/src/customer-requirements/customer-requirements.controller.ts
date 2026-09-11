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
import { CustomerRequirementsService } from './customer-requirements.service';
import {
  CreateCustomerRequirementDto,
  ImportCustomerRequirementsDto,
  UpdateCustomerRequirementDto,
} from './dto/customer-requirement.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';

@ApiTags('customer-requirements')
@Controller('customer-requirements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.user)
export class CustomerRequirementsController {
  constructor(private readonly customerRequirementsService: CustomerRequirementsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiOkResponse({ description: 'Customer requirement list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.customerRequirementsService.findAll({ keyword, status, customerId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customerRequirementsService.findOne(id);
  }

  @Post('import')
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Batch import customer requirements (upsert by requirementCode)' })
  importBatch(@Body() dto: ImportCustomerRequirementsDto, @CurrentUser() user?: JwtPayload) {
    return this.customerRequirementsService.importBatch(dto, actorUserId(user));
  }

  @Post()
  @Roles(UserRole.admin)
  create(@Body() dto: CreateCustomerRequirementDto, @CurrentUser() user?: JwtPayload) {
    return this.customerRequirementsService.create(dto, actorUserId(user));
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerRequirementDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.customerRequirementsService.update(id, dto, actorUserId(user));
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.customerRequirementsService.remove(id);
  }
}
