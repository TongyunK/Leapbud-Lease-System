import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ReceiptKind } from '@prisma/client'

export class CreateReceiptDto {
  @ApiPropertyOptional({ description: '收据编号（省略则自动生成 RCP{YYMMDD}{####}）' })
  @IsOptional()
  @IsString()
  receiptCode?: string

  @ApiPropertyOptional({
    enum: ReceiptKind,
    description: '收据分类：booking_deposit=定金收据，invoice=发票收据；有发票时强制 invoice',
  })
  @IsOptional()
  @IsEnum(ReceiptKind)
  kind?: ReceiptKind

  @ApiPropertyOptional({ description: '所属客户 ID（与 customerCode / customerName 二选一）' })
  @IsOptional()
  @IsString()
  customerId?: string

  @ApiPropertyOptional({ description: '客户编号（导入推荐）' })
  @IsOptional()
  @IsString()
  customerCode?: string

  @ApiPropertyOptional({ description: '客户名称（导入时可按名称解析）' })
  @IsOptional()
  @IsString()
  customerName?: string

  @ApiPropertyOptional({ description: '所属合约 ID' })
  @IsOptional()
  @IsString()
  contractId?: string

  @ApiPropertyOptional({ description: '所属合约编号' })
  @IsOptional()
  @IsString()
  contractCode?: string

  @ApiPropertyOptional({ description: '所属发票 ID' })
  @IsOptional()
  @IsString()
  invoiceId?: string

  @ApiPropertyOptional({ description: '所属发票编号' })
  @IsOptional()
  @IsString()
  invoiceCode?: string

  @ApiPropertyOptional({ description: '所属应收帐 ID' })
  @IsOptional()
  @IsString()
  receivableId?: string

  @ApiPropertyOptional({ description: '所属应收编号' })
  @IsOptional()
  @IsString()
  receivableCode?: string

  @ApiPropertyOptional({ description: '收款日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  paymentDate?: string

  @ApiPropertyOptional({ description: '收款方式' })
  @IsOptional()
  @IsString()
  paymentMethod?: string

  @ApiPropertyOptional({ description: '收款金额' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional({ description: '修改记录' })
  @IsOptional()
  @IsString()
  changeLog?: string
}

export class UpdateReceiptDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptCode?: string

  @ApiPropertyOptional({ enum: ReceiptKind })
  @IsOptional()
  @IsEnum(ReceiptKind)
  kind?: ReceiptKind

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractId?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceId?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receivableId?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receivableCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentDate?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentMethod?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  changeLog?: string
}

export class ImportReceiptsDto {
  @ApiProperty({ type: [CreateReceiptDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateReceiptDto)
  items!: CreateReceiptDto[]
}
