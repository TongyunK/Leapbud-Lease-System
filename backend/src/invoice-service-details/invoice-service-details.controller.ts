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
import { InvoiceServiceDetailsService } from './invoice-service-details.service';
import {
  CreateInvoiceServiceDetailDto,
  ImportInvoiceServiceDetailsDto,
  UpdateInvoiceServiceDetailDto,
} from './dto/invoice-service-detail.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { BatchDeleteDto } from '../common/batch-delete';

@ApiTags('invoice-service-details')
@Controller('invoice-service-details')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.user)
export class InvoiceServiceDetailsController {
  constructor(private readonly invoiceServiceDetailsService: InvoiceServiceDetailsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'invoiceId', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated invoice service detail list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('invoiceId') invoiceId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.invoiceServiceDetailsService.findAll({
      keyword,
      invoiceId,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      createdAtFrom,
      createdAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post('import')
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Batch import invoice service details' })
  importBatch(@Body() dto: ImportInvoiceServiceDetailsDto, @CurrentUser() user?: JwtPayload) {
    return this.invoiceServiceDetailsService.importBatch(dto, actorUserId(user));
  }

  @Post('batch-delete')
  @Roles(UserRole.admin)
  @ApiOkResponse({ description: 'Batch delete invoice service details by ids' })
  removeMany(@Body() dto: BatchDeleteDto) {
    return this.invoiceServiceDetailsService.removeMany(dto.ids);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoiceServiceDetailsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.admin)
  create(@Body() dto: CreateInvoiceServiceDetailDto, @CurrentUser() user?: JwtPayload) {
    return this.invoiceServiceDetailsService.create(dto, actorUserId(user));
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceServiceDetailDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.invoiceServiceDetailsService.update(id, dto, actorUserId(user));
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.invoiceServiceDetailsService.remove(id);
  }
}
