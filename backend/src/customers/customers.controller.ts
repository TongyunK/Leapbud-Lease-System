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
import { CustomersService } from './customers.service';
import { CreateCustomerDto, ImportCustomersDto, UpdateCustomerDto } from './dto/customer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';

@ApiTags('customers')
@Controller('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.user)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiOkResponse({ description: 'Customer list' })
  findAll(@Query('keyword') keyword?: string, @Query('status') status?: string) {
    return this.customersService.findAll({ keyword, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post('import')
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Batch import customers (upsert by customerCode)' })
  importBatch(@Body() dto: ImportCustomersDto, @CurrentUser() user?: JwtPayload) {
    return this.customersService.importBatch(dto, actorUserId(user));
  }

  @Post()
  @Roles(UserRole.admin)
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user?: JwtPayload) {
    return this.customersService.create(dto, actorUserId(user));
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.customersService.update(id, dto, actorUserId(user));
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }
}
