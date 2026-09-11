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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class LeaseTerminationOtherFeeDto {
  @ApiPropertyOptional({ description: '费用项 ID（全量替换时忽略）' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: '描述' })
  @IsString()
  @MinLength(1)
  description!: string;

  @ApiProperty({ description: '数量' })
  @Type(() => Number)
  @IsNumber()
  quantity!: number;

  @ApiProperty({ description: '单价（按金）' })
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
  @IsNumber()
  sortOrder?: number;
}

export class CreateLeaseTerminationDto {
  @ApiPropertyOptional({ description: '所属合约 ID（与 contractCode 二选一）' })
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional({ description: '所属合约编号（导入推荐）' })
  @IsOptional()
  @IsString()
  contractCode?: string;

  @ApiPropertyOptional({ description: '房间编号（无合约编号时按房间解析合约，旧系统导入）' })
  @IsOptional()
  @IsString()
  roomCode?: string;

  @ApiPropertyOptional({ description: '客户名称（与 roomCode 一起缩小合约范围）' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ description: '所属客户 ID（省略则从合约复制）' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: '所属房间 ID（省略则从合约复制）' })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({ description: '退租编号（省略则自动生成 TRM{YYMMDD}{####}）' })
  @IsOptional()
  @IsString()
  terminationCode?: string;

  @ApiPropertyOptional({ description: '退租原因' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: '退租日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  terminationDate?: string;

  @ApiPropertyOptional({ description: '客户书面通知附件路径' })
  @IsOptional()
  @IsString()
  noticeAttachment?: string;

  @ApiPropertyOptional({ description: '房门匙已回收数量' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  doorKeyReturnedQty?: number;

  @ApiPropertyOptional({ description: '智能卡（信箱匙）已回收数量' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  smartCardReturnedQty?: number;

  @ApiPropertyOptional({ description: '现场情况' })
  @IsOptional()
  @IsString()
  siteCondition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ description: '关联退按金单编号/引用' })
  @IsOptional()
  @IsString()
  relatedDepositRefund?: string;

  @ApiPropertyOptional({ type: [LeaseTerminationOtherFeeDto], description: '按金扣除 / 其他费用项（全量替换）' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LeaseTerminationOtherFeeDto)
  otherFees?: LeaseTerminationOtherFeeDto[];
}

export class UpdateLeaseTerminationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  terminationCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  terminationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  noticeAttachment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  doorKeyReturnedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  smartCardReturnedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  siteCondition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relatedDepositRefund?: string;

  @ApiPropertyOptional({ type: [LeaseTerminationOtherFeeDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LeaseTerminationOtherFeeDto)
  otherFees?: LeaseTerminationOtherFeeDto[];
}

export class ImportLeaseTerminationsDto {
  @ApiProperty({ type: [CreateLeaseTerminationDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateLeaseTerminationDto)
  items!: CreateLeaseTerminationDto[];
}
