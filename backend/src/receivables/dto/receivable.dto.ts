import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class CreateReceivableDto {
  @ApiPropertyOptional({ description: '所属发票 ID（与 invoiceCode 二选一）' })
  @IsOptional()
  @IsString()
  invoiceId?: string

  @ApiPropertyOptional({ description: '所属发票编号（导入推荐）' })
  @IsOptional()
  @IsString()
  invoiceCode?: string

  @ApiPropertyOptional({ description: '应收编号（省略则自动生成 AR{YYMMDD}{####}）' })
  @IsOptional()
  @IsString()
  receivableCode?: string

  @ApiPropertyOptional({ description: '所属合约 ID（省略则从发票复制）' })
  @IsOptional()
  @IsString()
  contractId?: string

  @ApiPropertyOptional({ description: '所属合约编号（与 contractId 二选一，可覆盖发票合约）' })
  @IsOptional()
  @IsString()
  contractCode?: string

  @ApiPropertyOptional({ description: '所属客户 ID（省略则从发票复制）' })
  @IsOptional()
  @IsString()
  customerId?: string

  @ApiPropertyOptional({ description: '发票日期 YYYY-MM-DD（省略则从发票复制）' })
  @IsOptional()
  @IsString()
  invoiceDate?: string

  @ApiPropertyOptional({ description: '收款期限 YYYY-MM-DD（省略则从发票复制）' })
  @IsOptional()
  @IsString()
  paymentDueDate?: string

  @ApiPropertyOptional({ description: '开票金额（省略则从发票金额复制）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  invoiceAmount?: number

  @ApiPropertyOptional({ description: '已收金额' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  receivedAmount?: number

  @ApiPropertyOptional({ description: '应收金额（省略则 = 开票金额 − 已收金额）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  receivableAmount?: number

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional({ description: '收款记录引用（兼容旧导入；正式关联优先用 receiptIds）' })
  @IsOptional()
  @IsString()
  relatedReceiptRef?: string

  @ApiPropertyOptional({
    description: '关联收据 ID 列表（一对多；传入则同步 receipts.receivableId，顺序写入 relatedReceiptRef）',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  receiptIds?: string[]

  @ApiPropertyOptional({ description: '关联按金退还记录 ID' })
  @IsOptional()
  @IsString()
  depositRefundId?: string | null

  @ApiPropertyOptional({ description: '关联按金退还编号（与 depositRefundId 二选一）' })
  @IsOptional()
  @IsString()
  depositRefundCode?: string
}

export class UpdateReceivableDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receivableCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceDate?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentDueDate?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  invoiceAmount?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  receivedAmount?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  receivableAmount?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relatedReceiptRef?: string

  @ApiPropertyOptional({
    description: '关联收据 ID 列表（一对多；传入则同步 receipts.receivableId）',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  receiptIds?: string[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  depositRefundId?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  depositRefundCode?: string
}

export class ImportReceivablesDto {
  @ApiProperty({ type: [CreateReceivableDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateReceivableDto)
  items!: CreateReceivableDto[]
}
