import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { FilesInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { PermissionsGuard } from '../permissions/permissions.guard'
import { RequirePermissions } from '../permissions/require-permissions.decorator'
import { CurrentUser, actorUserId } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/jwt-auth.guard'
import { splitCsv } from '../common/pagination'
import { RefundOrdersQueryService } from './refund-orders-query.service'

class DisburseRefundDto {
  @ApiPropertyOptional({ description: '本次打款金额；省略则打剩余全额' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number

  @ApiPropertyOptional({ description: '打款日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  refundDate?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentMethod?: string

  @ApiPropertyOptional({ description: '打款经办人用户 ID' })
  @IsOptional()
  @IsString()
  handlerId?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string
}

@ApiTags('refund-orders')
@Controller('refund-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.admin, UserRole.user)
export class RefundOrdersController {
  constructor(private readonly refundOrders: RefundOrdersQueryService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'settlementId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'refundCodes', required: false })
  @ApiQuery({ name: 'statuses', required: false })
  @ApiQuery({ name: 'contractCodes', required: false })
  @ApiQuery({ name: 'customerNames', required: false })
  @ApiQuery({ name: 'settlementCodes', required: false })
  @ApiQuery({ name: 'itemCounts', required: false })
  @ApiQuery({ name: 'attachmentCounts', required: false })
  @ApiQuery({ name: 'cashFlowCounts', required: false })
  @ApiQuery({ name: 'amounts', required: false })
  @ApiQuery({ name: 'paidAmounts', required: false })
  @ApiQuery({ name: 'remainingAmounts', required: false })
  @ApiQuery({ name: 'createdBys', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @ApiQuery({ name: 'createdAtFrom', required: false })
  @ApiQuery({ name: 'createdAtTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ description: 'Paginated refund orders' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('contractId') contractId?: string,
    @Query('customerId') customerId?: string,
    @Query('settlementId') settlementId?: string,
    @Query('status') status?: string,
    @Query('refundCodes') refundCodes?: string,
    @Query('statuses') statuses?: string,
    @Query('contractCodes') contractCodes?: string,
    @Query('customerNames') customerNames?: string,
    @Query('settlementCodes') settlementCodes?: string,
    @Query('itemCounts') itemCounts?: string,
    @Query('attachmentCounts') attachmentCounts?: string,
    @Query('cashFlowCounts') cashFlowCounts?: string,
    @Query('amounts') amounts?: string,
    @Query('paidAmounts') paidAmounts?: string,
    @Query('remainingAmounts') remainingAmounts?: string,
    @Query('createdBys') createdBys?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('createdAtFrom') createdAtFrom?: string,
    @Query('createdAtTo') createdAtTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.refundOrders.findAll({
      keyword,
      contractId,
      customerId,
      settlementId,
      status,
      refundCodes: splitCsv(refundCodes),
      statuses: splitCsv(statuses),
      contractCodes: splitCsv(contractCodes),
      customerNames: splitCsv(customerNames),
      settlementCodes: splitCsv(settlementCodes),
      itemCounts: splitCsv(itemCounts),
      attachmentCounts: splitCsv(attachmentCounts),
      cashFlowCounts: splitCsv(cashFlowCounts),
      amounts: splitCsv(amounts),
      paidAmounts: splitCsv(paidAmounts),
      remainingAmounts: splitCsv(remainingAmounts),
      createdBys: splitCsv(createdBys),
      sortBy,
      sortDir,
      createdAtFrom,
      createdAtTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    })
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Refund order detail' })
  findOne(@Param('id') id: string) {
    return this.refundOrders.findOne(id)
  }

  @Delete(':id')
  @RequirePermissions('refundOrders:delete')
  @ApiOkResponse({ description: 'Delete refund order' })
  remove(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    return this.refundOrders.remove(id, actorUserId(user))
  }

  @Post(':id/disburse')
  @RequirePermissions('refundOrders:update')
  @ApiOkResponse({ description: 'Disburse (full or partial) and write cash flow' })
  disburse(
    @Param('id') id: string,
    @Body() dto: DisburseRefundDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.refundOrders.disburse(id, dto, actorUserId(user))
  }

  /** @deprecated 使用 disburse；保留兼容旧前端 */
  @Post(':id/mark-paid')
  @RequirePermissions('refundOrders:update')
  @ApiOkResponse({ description: 'Mark refund order paid (alias of disburse)' })
  markPaid(
    @Param('id') id: string,
    @Body() dto: DisburseRefundDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.refundOrders.disburse(id, dto, actorUserId(user))
  }

  @Post(':id/attachments')
  @RequirePermissions('refundOrders:update')
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
  @ApiOkResponse({ description: 'Upload one or more refund payout vouchers' })
  uploadAttachments(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.refundOrders.uploadAttachments(id, files || [], actorUserId(user))
  }

  @Get(':id/attachments/:attachmentId/file')
  @ApiOkResponse({ description: 'Stream refund order attachment file' })
  getAttachmentFile(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.refundOrders.getAttachmentFile(id, attachmentId)
  }

  @Delete(':id/attachments/:attachmentId')
  @RequirePermissions('refundOrders:update')
  @ApiOkResponse({ description: 'Delete one refund order attachment' })
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.refundOrders.removeAttachment(id, attachmentId)
  }
}
