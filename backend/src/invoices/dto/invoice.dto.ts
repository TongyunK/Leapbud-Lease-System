import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class InvoiceServiceDetailDto {
  @ApiPropertyOptional({ description: '服务细节行 ID（全量替换时忽略）' })
  @IsOptional()
  @IsString()
  id?: string

  @ApiProperty({ description: '描述' })
  @IsString()
  @MinLength(1)
  description!: string

  @ApiProperty({ description: '数量' })
  @Type(() => Number)
  @IsNumber()
  quantity!: number

  @ApiProperty({ description: '单价' })
  @Type(() => Number)
  @IsNumber()
  unitAmount!: number

  @ApiPropertyOptional({ description: '小计（默认 = 数量 × 单价）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  subtotal?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number
}

export class CreateInvoiceDto {
  @ApiPropertyOptional({
    description: '开票来源：contract=合约发票（默认）；short_term=短租发票（无合约）',
    example: 'contract',
  })
  @IsOptional()
  @IsString()
  source?: string

  @ApiPropertyOptional({ description: '所属合约 ID（与 contractCode 二选一；短租可省略）' })
  @IsOptional()
  @IsString()
  contractId?: string

  @ApiPropertyOptional({ description: '所属合约编号（导入推荐）' })
  @IsOptional()
  @IsString()
  contractCode?: string

  @ApiPropertyOptional({ description: '发票编号（省略则自动生成 INV{YYMMDD}{####}）' })
  @IsOptional()
  @IsString()
  invoiceCode?: string

  @ApiPropertyOptional({ description: '所属客户 ID（合约票可省略从合约复制；短租必填）' })
  @IsOptional()
  @IsString()
  customerId?: string

  @ApiPropertyOptional({ description: '所属房间 ID（合约票可省略从合约复制；短租必填）' })
  @IsOptional()
  @IsString()
  roomId?: string

  @ApiPropertyOptional({ description: '短租：租赁开始日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  rentalStartDate?: string

  @ApiPropertyOptional({ description: '短租：租赁结束日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  rentalEndDate?: string

  @ApiPropertyOptional({ description: '短租：描述租赁时长' })
  @IsOptional()
  @IsString()
  rentalDurationText?: string

  @ApiPropertyOptional({ description: '短租：经此客户介绍（客户 ID）' })
  @IsOptional()
  @IsString()
  referredByCustomerId?: string | null

  @ApiPropertyOptional({ description: '发票类型' })
  @IsOptional()
  @IsString()
  invoiceType?: string

  @ApiPropertyOptional({ description: '发票描述' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional({ description: '开票金额' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number

  @ApiPropertyOptional({ description: '状态（默认待开票）' })
  @IsOptional()
  @IsString()
  status?: string

  @ApiPropertyOptional({ description: '发票日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  invoiceDate?: string

  @ApiPropertyOptional({ description: '收款期限 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  paymentDueDate?: string

  @ApiPropertyOptional({ description: '销售经理用户 ID（省略则从合约复制）' })
  @IsOptional()
  @IsString()
  salesManagerId?: string | null

  @ApiPropertyOptional({ description: '应收帐引用' })
  @IsOptional()
  @IsString()
  relatedReceivableRef?: string

  @ApiPropertyOptional({ description: '开票附件路径' })
  @IsOptional()
  @IsString()
  attachment?: string

  @ApiPropertyOptional({ description: '房间名称文本快照' })
  @IsOptional()
  @IsString()
  roomNameText?: string

  @ApiPropertyOptional({ description: '备注（业务说明）' })
  @IsOptional()
  @IsString()
  notes?: string

  @ApiPropertyOptional({ description: 'WhatsApp 号码' })
  @IsOptional()
  @IsString()
  whatsappNumber?: string

  @ApiPropertyOptional({ description: '短租编号' })
  @IsOptional()
  @IsString()
  shortTermRentalCode?: string

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional({
    type: [InvoiceServiceDetailDto],
    description: '服务细节行（全量替换）',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InvoiceServiceDetailDto)
  serviceDetails?: InvoiceServiceDetailDto[]
}

export class UpdateInvoiceDto {
  @ApiPropertyOptional({ description: '开票来源（一般不改；短租/合约）' })
  @IsOptional()
  @IsString()
  source?: string

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
  invoiceCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomId?: string

  @ApiPropertyOptional({ description: '短租：租赁开始日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  rentalStartDate?: string

  @ApiPropertyOptional({ description: '短租：租赁结束日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  rentalEndDate?: string

  @ApiPropertyOptional({ description: '短租：描述租赁时长' })
  @IsOptional()
  @IsString()
  rentalDurationText?: string

  @ApiPropertyOptional({ description: '短租：经此客户介绍（客户 ID）' })
  @IsOptional()
  @IsString()
  referredByCustomerId?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceType?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string

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
  @IsString()
  salesManagerId?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relatedReceivableRef?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachment?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomNameText?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsappNumber?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortTermRentalCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional({ type: [InvoiceServiceDetailDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InvoiceServiceDetailDto)
  serviceDetails?: InvoiceServiceDetailDto[]
}

export class ImportInvoicesDto {
  @ApiProperty({ type: [CreateInvoiceDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceDto)
  items!: CreateInvoiceDto[]
}
