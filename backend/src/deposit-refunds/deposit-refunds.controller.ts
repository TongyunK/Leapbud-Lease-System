import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { memoryStorage } from 'multer'
import { DepositRefundsService } from './deposit-refunds.service'
import {
  CreateDepositRefundDto,
  ImportDepositRefundsDto,
  UpdateDepositRefundDto,
} from './dto/deposit-refund.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { CurrentUser, actorUserId } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/jwt-auth.guard'
import { BatchDeleteDto } from '../common/batch-delete'
import { splitCsv } from '../common/pagination'

@ApiTags('deposit-refunds')
@Controller('deposit-refunds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class DepositRefundsController {
  constructor(private readonly depositRefundsService: DepositRefundsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'roomId', required: false })
  @ApiQuery({ name: 'refundCodes', required: false })
  @ApiQuery({ name: 'contractCodes', required: false })
  @ApiQuery({ name: 'customerNames', required: false, description: 'Comma-separated customer names' })
  @ApiQuery({ name: 'roomNames', required: false })
  @ApiQuery({ name: 'totalDeposits', required: false })
  @ApiQuery({ name: 'actualRefundAmounts', required: false })
  @ApiQuery({ name: 'handlers', required: false })
  @ApiQuery({ name: 'createdBys', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'terminationDateFrom', required: false })
  @ApiQuery({ name: 'terminationDateTo', required: false })
  @ApiQuery({ name: 'refundDateFrom', required: false })
  @ApiQuery({ name: 'refundDateTo', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated deposit refund list' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('contractId') contractId?: string,
    @Query('customerId') customerId?: string,
    @Query('roomId') roomId?: string,
    @Query('refundCodes') refundCodes?: string,
    @Query('contractCodes') contractCodes?: string,
    @Query('customerNames') customerNames?: string,
    @Query('roomNames') roomNames?: string,
    @Query('totalDeposits') totalDeposits?: string,
    @Query('actualRefundAmounts') actualRefundAmounts?: string,
    @Query('handlers') handlers?: string,
    @Query('createdBys') createdBys?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('terminationDateFrom') terminationDateFrom?: string,
    @Query('terminationDateTo') terminationDateTo?: string,
    @Query('refundDateFrom') refundDateFrom?: string,
    @Query('refundDateTo') refundDateTo?: string,
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.depositRefundsService.findAll({
      keyword,
      contractId,
      customerId,
      roomId,
      refundCodes: splitCsv(refundCodes),
      contractCodes: splitCsv(contractCodes),
      customerNames: splitCsv(customerNames),
      roomNames: splitCsv(roomNames),
      totalDeposits: splitCsv(totalDeposits),
      actualRefundAmounts: splitCsv(actualRefundAmounts),
      handlers: splitCsv(handlers),
      createdBys: splitCsv(createdBys),
      status,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      terminationDateFrom,
      terminationDateTo,
      refundDateFrom,
      refundDateTo,
      createdAtFrom,
      createdAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    })
  }

  @RequirePermissions('depositRefunds:import')
  @Post('import')
  @ApiOkResponse({ description: 'Batch import deposit refunds' })
  importBatch(@Body() dto: ImportDepositRefundsDto, @CurrentUser() user?: JwtPayload) {
    return this.depositRefundsService.importBatch(dto, actorUserId(user))
  }

  @Post('batch-delete')
  @RequirePermissions('depositRefunds:batchDelete')
  @ApiOkResponse({ description: 'Batch delete deposit refunds' })
  batchDelete(@Body() dto: BatchDeleteDto) {
    return this.depositRefundsService.removeMany(dto.ids || [])
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Deposit refund detail' })
  findOne(@Param('id') id: string) {
    return this.depositRefundsService.findOne(id)
  }

  @RequirePermissions('depositRefunds:create')
  @Post()
  @ApiOkResponse({ description: 'Create deposit refund' })
  create(@Body() dto: CreateDepositRefundDto, @CurrentUser() user?: JwtPayload) {
    return this.depositRefundsService.create(dto, actorUserId(user))
  }

  @RequirePermissions('depositRefunds:update')
  @Patch(':id')
  @ApiOkResponse({ description: 'Update deposit refund' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDepositRefundDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.depositRefundsService.update(id, dto, actorUserId(user))
  }

  @Post(':id/attachments')
  @RequirePermissions('depositRefunds:update')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 30, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiOkResponse({ description: 'Upload one or more deposit refund vouchers' })
  uploadAttachments(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.depositRefundsService.uploadAttachments(id, files || [], actorUserId(user))
  }

  @Get(':id/attachments/:attachmentId/file')
  @ApiOkResponse({ description: 'Stream deposit refund attachment file' })
  getAttachmentFile(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.depositRefundsService.getAttachmentFile(id, attachmentId)
  }

  @Delete(':id/attachments/:attachmentId')
  @RequirePermissions('depositRefunds:update')
  @ApiOkResponse({ description: 'Delete one deposit refund attachment' })
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.depositRefundsService.removeAttachment(id, attachmentId)
  }

  @RequirePermissions('depositRefunds:delete')
  @Delete(':id')
  @ApiOkResponse({ description: 'Delete deposit refund' })
  remove(@Param('id') id: string) {
    return this.depositRefundsService.remove(id)
  }
}
