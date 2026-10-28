import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 开单：上传租客签约文件，状态 簽約中 → 租賃中 */
export class OpenContractOrderDto {
  @ApiProperty({ description: '租客签约文件（上传后的 storageKey）' })
  @IsString()
  @IsNotEmpty()
  attachment!: string;
}

/** 借出物品 / 其他费用（嵌套写入，仅合约级、不含退租关联项） */
export class ContractOtherFeeInputDto {
  @ApiPropertyOptional({ description: '费用项 ID（全量替换时忽略）' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: '更衣櫃鎖匙', description: '物品 / 费用描述' })
  @IsString()
  @MinLength(1)
  description!: string;

  @ApiProperty({ example: 1, description: '数量（必填）' })
  @Type(() => Number)
  @IsNumber()
  quantity!: number;

  @ApiProperty({ example: 50, description: '单价（按金，必填）' })
  @Type(() => Number)
  @IsNumber()
  unitAmount!: number;

  @ApiPropertyOptional({ description: '小计（默认 = 数量 × 单价）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  subtotal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

/** 合约期（嵌套写入） */
export class ContractPeriodInputDto {
  @ApiProperty({ example: '使用期', description: '使用期 / 必須使用期 / 免租期' })
  @IsString()
  @MinLength(1)
  dateType!: string;

  @ApiPropertyOptional({ example: '月', description: '月 / 日' })
  @IsOptional()
  @IsString()
  dateUnit?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dateValue?: number;

  @ApiProperty({ example: '2026-05-22' })
  @IsString()
  @MinLength(1)
  startDate!: string;

  @ApiProperty({ example: '2027-05-21' })
  @IsString()
  @MinLength(1)
  endDate!: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class CreateContractDto {
  @ApiPropertyOptional({ example: 'CTR2609110001' })
  @IsOptional()
  @IsString()
  contractCode?: string;

  @ApiProperty({ example: 'clx...' })
  @IsString()
  @MinLength(1)
  roomId!: string;

  @ApiProperty({ example: 'clx...' })
  @IsString()
  @MinLength(1)
  customerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  salesManagerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  requirementId?: string | null;

  @ApiPropertyOptional({ example: '2026-09-11' })
  @IsOptional()
  @IsString()
  startDate?: string | null;

  @ApiPropertyOptional({ example: '2027-09-10' })
  @IsOptional()
  @IsString()
  endDate?: string | null;

  @ApiPropertyOptional({ example: '2027-09-10' })
  @IsOptional()
  @IsString()
  actualEndDate?: string | null;

  @ApiPropertyOptional({ example: '整租' })
  @IsOptional()
  @IsString()
  leaseType?: string;

  @ApiPropertyOptional({ example: 'whole', description: 'whole=整租；part=分租某份位' })
  @IsOptional()
  @IsString()
  occupancyMode?: string;

  @ApiPropertyOptional({ example: 'A', description: '分租份位标签' })
  @IsOptional()
  @IsString()
  partLabel?: string;

  @ApiPropertyOptional({ example: '簽約中' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  roomDeposit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  monthlyRent?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bookingDeposit?: number | null;

  @ApiPropertyOptional({ example: '2026-05-22', description: '已收订金的收款日期' })
  @IsOptional()
  @IsString()
  paymentDate?: string | null;

  @ApiPropertyOptional({ example: '月繳-1' })
  @IsOptional()
  @IsString()
  paymentCycle?: string;

  @ApiPropertyOptional({ example: '轉數快', description: '收款方式：轉數快 / 銀行過數 / 支票 / 現金' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: '定金收款凭证（图片或文件路径）' })
  @IsOptional()
  @IsString()
  paymentVoucher?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  electricityRate?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  miscDeposit?: number | null;

  @ApiPropertyOptional({ description: '房门匙数量；按金由配置单价自动计算' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  doorKeyQty?: number | null;

  @ApiPropertyOptional({ description: '智能卡信箱匙数量；按金由配置单价自动计算' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mailboxKeyQty?: number | null;

  @ApiPropertyOptional({ deprecated: true, description: '由 doorKeyQty × 单价自动计算，无需提交' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  doorKeyDeposit?: number | null;

  @ApiPropertyOptional({ deprecated: true, description: '由 mailboxKeyQty × 单价自动计算，无需提交' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mailboxKeyDeposit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomNameText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subleaseMark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ type: [ContractPeriodInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ContractPeriodInputDto)
  periods?: ContractPeriodInputDto[];

  @ApiPropertyOptional({ type: [ContractOtherFeeInputDto], description: '借出物品（全量替换合约级费用）' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ContractOtherFeeInputDto)
  otherFees?: ContractOtherFeeInputDto[];

  @ApiPropertyOptional({
    description: '直接开单：须已上传签约文件，创建后状态为「租賃中」；否则固定「簽約中」',
  })
  @IsOptional()
  @IsBoolean()
  issueNow?: boolean;
}

export class UpdateContractDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  contractCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  roomId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  salesManagerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  requirementId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actualEndDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leaseType?: string;

  @ApiPropertyOptional({ example: 'whole', description: 'whole=整租；part=分租某份位' })
  @IsOptional()
  @IsString()
  occupancyMode?: string;

  @ApiPropertyOptional({ example: 'A', description: '分租份位标签' })
  @IsOptional()
  @IsString()
  partLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  roomDeposit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  monthlyRent?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bookingDeposit?: number | null;

  @ApiPropertyOptional({ example: '2026-05-22', description: '已收订金的收款日期' })
  @IsOptional()
  @IsString()
  paymentDate?: string | null;

  @ApiPropertyOptional({ example: '月繳-1' })
  @IsOptional()
  @IsString()
  paymentCycle?: string;

  @ApiPropertyOptional({ example: '轉數快', description: '收款方式：轉數快 / 銀行過數 / 支票 / 現金' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: '定金收款凭证（图片或文件路径）' })
  @IsOptional()
  @IsString()
  paymentVoucher?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  electricityRate?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  miscDeposit?: number | null;

  @ApiPropertyOptional({ description: '房门匙数量；按金由配置单价自动计算' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  doorKeyQty?: number | null;

  @ApiPropertyOptional({ description: '智能卡信箱匙数量；按金由配置单价自动计算' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mailboxKeyQty?: number | null;

  @ApiPropertyOptional({ deprecated: true, description: '由 doorKeyQty × 单价自动计算，无需提交' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  doorKeyDeposit?: number | null;

  @ApiPropertyOptional({ deprecated: true, description: '由 mailboxKeyQty × 单价自动计算，无需提交' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mailboxKeyDeposit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomNameText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subleaseMark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  /** 传入则整表替换合约期；不传则保持原样 */
  @ApiPropertyOptional({ type: [ContractPeriodInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ContractPeriodInputDto)
  periods?: ContractPeriodInputDto[];

  /** 传入则整表替换合约级借出物品（不含已关联退租的费用行） */
  @ApiPropertyOptional({ type: [ContractOtherFeeInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ContractOtherFeeInputDto)
  otherFees?: ContractOtherFeeInputDto[];

  @ApiPropertyOptional({
    description: '直接开单：须已上传签约文件，保存后状态改为「租賃中」',
  })
  @IsOptional()
  @IsBoolean()
  issueNow?: boolean;
}

/** 批量导入单行（Excel：房间编号 / 客户编号 / 经理账号或姓名） */
export class ImportContractItemDto {
  @ApiPropertyOptional({ example: 'CTR2609110001' })
  @IsOptional()
  @IsString()
  contractCode?: string;

  @ApiProperty({ example: 'SP3C06' })
  @IsString()
  @MinLength(1)
  roomCode!: string;

  @ApiPropertyOptional({ example: 'CSM260001', description: '客户编号（与 customerName 二选一）' })
  @IsOptional()
  @IsString()
  customerCode?: string;

  @ApiPropertyOptional({ description: '客户名称（旧系统导入兜底；与 customerCode 二选一）' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ description: '销售经理显示名或账号' })
  @IsOptional()
  @IsString()
  salesManager?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requirementCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actualEndDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leaseType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  monthlyRent?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  roomDeposit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bookingDeposit?: number | null;

  @ApiPropertyOptional({ example: '2026-05-22', description: '已收订金的收款日期' })
  @IsOptional()
  @IsString()
  paymentDate?: string | null;

  @ApiPropertyOptional({ example: '月繳-1' })
  @IsOptional()
  @IsString()
  paymentCycle?: string;

  @ApiPropertyOptional({ example: '轉數快' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: '定金收款凭证（图片或文件路径）' })
  @IsOptional()
  @IsString()
  paymentVoucher?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  electricityRate?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  miscDeposit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  doorKeyQty?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mailboxKeyQty?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomNameText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subleaseMark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class ImportContractsDto {
  @ApiProperty({ type: [ImportContractItemDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportContractItemDto)
  items!: ImportContractItemDto[];
}
