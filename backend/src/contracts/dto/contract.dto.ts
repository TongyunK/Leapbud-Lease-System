import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({ example: '草稿' })
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

  @ApiPropertyOptional({ example: '月繳' })
  @IsOptional()
  @IsString()
  paymentCycle?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentCycle?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentCycle?: string;

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
