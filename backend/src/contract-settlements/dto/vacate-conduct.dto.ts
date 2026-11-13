import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

/** 退租结算额外扣除／费用行 */
export class VacateOtherFeeDto {
  @ApiPropertyOptional({ description: '费用项 ID（全量替换时忽略）' })
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

  @ApiProperty({ description: '单价（按金）' })
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

/** 借出物品验收行 */
export class ConductLoanCheckDto {
  @ApiProperty({ description: '借出物品（ContractLoanItem）ID' })
  @IsString()
  @MinLength(1)
  loanFeeId!: string

  @ApiProperty({
    description: '验收：returned=已归还，damaged=损坏，missing=未归还',
    enum: ['returned', 'damaged', 'missing'],
  })
  @IsString()
  @MinLength(1)
  status!: 'returned' | 'damaged' | 'missing'

  @ApiPropertyOptional({ description: '损坏/未归还时扣除金额（默认按借出小计）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deductAmount?: number
}

/** 合约一键退租办理 → 写入 VACATE 结算单 */
export class ConductVacateSettlementDto {
  @ApiProperty({ description: '合约 ID' })
  @IsString()
  @MinLength(1)
  contractId!: string

  @ApiProperty({ description: '退租日期 YYYY-MM-DD' })
  @IsString()
  @MinLength(1)
  terminationDate!: string

  @ApiPropertyOptional({
    description:
      '退租类型：expiry=到期，early=提前；省略则按退租日与最后一期缴费首日比较（无切片则与合约到期日比较）',
    enum: ['expiry', 'early'],
  })
  @IsOptional()
  @IsString()
  terminationKind?: 'expiry' | 'early'

  @ApiPropertyOptional({ description: '退租原因' })
  @IsOptional()
  @IsString()
  reason?: string

  @ApiPropertyOptional({ description: '客户书面通知附件' })
  @IsOptional()
  @IsString()
  noticeAttachment?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  doorKeyReturnedQty?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  smartCardReturnedQty?: number

  @ApiPropertyOptional({
    description: '房门匙未还扣除金额（省略则按未还数量×单价自动算）',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  doorKeyDeductAmount?: number

  @ApiPropertyOptional({
    description: '智能卡未还扣除金额（省略则按未还数量×单价自动算）',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  smartCardDeductAmount?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  siteCondition?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional({ type: [ConductLoanCheckDto], description: '借出物品验收' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ConductLoanCheckDto)
  loanChecks?: ConductLoanCheckDto[]

  @ApiPropertyOptional({
    type: [VacateOtherFeeDto],
    description: '额外按金扣除（不含借出验收自动生成的）',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VacateOtherFeeDto)
  extraDeductions?: VacateOtherFeeDto[]

  @ApiPropertyOptional({
    description: '是否允许末结应收未清仍退租（默认 false，有未收则拒绝）',
  })
  @IsOptional()
  allowUnsettledReceivables?: boolean

  @ApiPropertyOptional({
    description: '已废弃：退租一律创建按金退还单；保留字段仅为兼容旧客户端',
    deprecated: true,
  })
  @IsOptional()
  createDepositRefund?: boolean

  @ApiPropertyOptional({ description: '退款日期 YYYY-MM-DD（默认=退租日）' })
  @IsOptional()
  @IsString()
  refundDate?: string

  @ApiPropertyOptional({ description: '实退按金（默认=按金总额−扣除合计）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualRefundAmount?: number

  @ApiPropertyOptional({ description: '一并退还定金余额（默认=当前可用余额）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bookingDepositRefundAmount?: number

  @ApiPropertyOptional({
    description: '按金退还状态（默认已退；可选未退／已退）',
  })
  @IsOptional()
  @IsString()
  depositRefundStatus?: string

  @ApiPropertyOptional({
    description:
      '已废弃：超出按金金额赔偿一律自动开票入应收；保留字段仅为兼容旧客户端',
    deprecated: true,
  })
  @IsOptional()
  createExcessCompensationReceivable?: boolean

  @ApiPropertyOptional({
    description:
      '超出按金金额赔偿是否先用定金余额抵扣：是则开票金额=超额−定金抵扣，并扣减可退定金；否且定金未退时，日后收款仍可用定金抵扣',
  })
  @IsOptional()
  applyBookingDepositToExcess?: boolean
}

/** 手工维护的按金扣除明细（写入结算 DAMAGE／PENALTY 明细） */
export class VacateDeductionItemDto {
  @ApiProperty({ description: '描述' })
  @IsString()
  @MinLength(1)
  description!: string

  @ApiPropertyOptional({ description: '数量' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number

  @ApiPropertyOptional({ description: '单价' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitAmount?: number

  @ApiPropertyOptional({ description: '金额（省略则用数量×单价）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number

  @ApiPropertyOptional({ description: '验收状态：damaged / missing；空则按罚金扣款' })
  @IsOptional()
  @IsString()
  returnStatus?: string

  @ApiPropertyOptional({ description: '来源借出物品 ID' })
  @IsOptional()
  @IsString()
  sourceLoanItemId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional({ description: '排序（0-based）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number
}

/** 手工新增 VACATE 结算（仅现场／备注等，不走一键退租） */
export class CreateVacateSettlementDto {
  @ApiPropertyOptional({ description: '所属合约 ID（与 contractCode 二选一）' })
  @IsOptional()
  @IsString()
  contractId?: string

  @ApiPropertyOptional({ description: '所属合约编号（导入推荐）' })
  @IsOptional()
  @IsString()
  contractCode?: string

  @ApiPropertyOptional({ description: '房间编号（无合约编号时按房间解析合约）' })
  @IsOptional()
  @IsString()
  roomCode?: string

  @ApiPropertyOptional({ description: '客户名称（与 roomCode 一起缩小合约范围）' })
  @IsOptional()
  @IsString()
  customerName?: string

  @ApiPropertyOptional({ description: '所属客户 ID（省略则从合约复制）' })
  @IsOptional()
  @IsString()
  customerId?: string

  @ApiPropertyOptional({ description: '所属房间 ID（省略则从合约复制）' })
  @IsOptional()
  @IsString()
  roomId?: string

  @ApiPropertyOptional({ description: '结算／退租日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  terminationDate?: string

  @ApiPropertyOptional({ description: '退租类型 expiry / early' })
  @IsOptional()
  @IsString()
  terminationKind?: string

  @ApiPropertyOptional({ description: '退租原因' })
  @IsOptional()
  @IsString()
  reason?: string

  @ApiPropertyOptional({ description: '客户书面通知附件路径' })
  @IsOptional()
  @IsString()
  noticeAttachment?: string

  @ApiPropertyOptional({ description: '房门匙已回收数量' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  doorKeyReturnedQty?: number

  @ApiPropertyOptional({ description: '智能卡已回收数量' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  smartCardReturnedQty?: number

  @ApiPropertyOptional({ description: '现场情况' })
  @IsOptional()
  @IsString()
  siteCondition?: string

  @ApiPropertyOptional({ description: '旧退租编号（导入回填）' })
  @IsOptional()
  @IsString()
  legacyTerminationCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional({
    type: [VacateDeductionItemDto],
    description: '按金扣除明细（DAMAGE／PENALTY；省略则不建扣除行）',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VacateDeductionItemDto)
  deductionItems?: VacateDeductionItemDto[]
}

export class UpdateVacateSettlementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  terminationDate?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  terminationKind?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  noticeAttachment?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  doorKeyReturnedQty?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  smartCardReturnedQty?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  siteCondition?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legacyTerminationCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional({
    type: [VacateDeductionItemDto],
    description: '按金扣除明细全量替换（传入则替换 DAMAGE／PENALTY；省略则不改明细）',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VacateDeductionItemDto)
  deductionItems?: VacateDeductionItemDto[]
}

export class ImportVacateSettlementsDto {
  @ApiProperty({ type: [CreateVacateSettlementDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateVacateSettlementDto)
  items!: CreateVacateSettlementDto[]
}
