import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
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

/** 合约收款：自选应收 + 定金抵扣 */
export class CollectWithBookingDepositDto {
  @ApiProperty({ description: '合约 ID' })
  @IsString()
  contractId!: string

  @ApiProperty({ type: [String], description: '所选应收 ID（按顺序 FIFO 分摊定金）' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  receivableIds!: string[]

  @ApiProperty({ description: '本次定金抵扣总额（可为 0）' })
  @Type(() => Number)
  @IsNumber()
  bookingDepositApply!: number

  @ApiPropertyOptional({
    description:
      '本次现金／转账收款金额（可为 0；缺省则收齐定金抵扣后的全部未收）',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cashAmount?: number

  @ApiProperty({ description: '收款日期 YYYY-MM-DD' })
  @IsString()
  paymentDate!: string

  @ApiPropertyOptional({ description: '现金／转账等收款方式（有现金部分时必填）' })
  @IsOptional()
  @IsString()
  paymentMethod?: string

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string
}

/** 定金余额退还（挂账余款） */
export class RefundBookingDepositDto {
  @ApiProperty({ description: '合约 ID' })
  @IsString()
  contractId!: string

  @ApiProperty({ description: '退还金额' })
  @Type(() => Number)
  @IsNumber()
  amount!: number

  @ApiProperty({ description: '退还日期 YYYY-MM-DD' })
  @IsString()
  refundDate!: string

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional({ description: '关联按金退还办理单 ID' })
  @IsOptional()
  @IsString()
  depositRefundId?: string
}

/** 签约中加收定金（新开收据或合并进第一张） */
export class TopUpBookingDepositDto {
  @ApiProperty({ description: '合约 ID' })
  @IsString()
  contractId!: string

  @ApiProperty({ description: '加收金额（须大于 0）' })
  @Type(() => Number)
  @IsNumber()
  amount!: number

  @ApiProperty({ description: '收款日期 YYYY-MM-DD' })
  @IsString()
  paymentDate!: string

  @ApiPropertyOptional({
    description:
      '加收方式：new_receipt=新开定金收据（默认）；merge=合并到已有定金收据（操作人自行判断尚未交给租客）',
    enum: ['new_receipt', 'merge'],
  })
  @IsOptional()
  @IsIn(['new_receipt', 'merge'])
  mode?: 'new_receipt' | 'merge'

  @ApiPropertyOptional({
    description: '合并目标定金收据 ID（mode=merge 时；省略则合并到首张）',
  })
  @IsOptional()
  @IsString()
  mergeReceiptId?: string

  @ApiPropertyOptional({ description: '收款方式' })
  @IsOptional()
  @IsString()
  paymentMethod?: string

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional({
    description: '收款凭证 storageKey（写入定金收据附件，并回写合约定金凭证）',
  })
  @IsOptional()
  @IsString()
  paymentVoucher?: string
}
