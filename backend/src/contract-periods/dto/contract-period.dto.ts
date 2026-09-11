import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateContractPeriodDto {
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

  @ApiProperty({ description: '日期类型：使用期 / 必須使用期 / 免租期 等' })
  @IsString()
  @MinLength(1)
  dateType!: string;

  @ApiPropertyOptional({ description: '日期单位：月 / 日' })
  @IsOptional()
  @IsString()
  dateUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dateValue?: number;

  @ApiProperty({ description: '开始日期 YYYY-MM-DD' })
  @IsString()
  @MinLength(1)
  startDate!: string;

  @ApiProperty({ description: '结束日期 YYYY-MM-DD' })
  @IsString()
  @MinLength(1)
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;
}

export class UpdateContractPeriodDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  dateType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dateValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;
}

export class ImportContractPeriodsDto {
  @ApiProperty({ type: [CreateContractPeriodDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateContractPeriodDto)
  items!: CreateContractPeriodDto[];
}
