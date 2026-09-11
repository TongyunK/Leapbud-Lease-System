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

export class CreateContractOtherFeeDto {
  @ApiPropertyOptional({ description: '所属合约 ID（与 contractCode 二选一）' })
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional({ description: '所属合约编号（导入推荐）' })
  @IsOptional()
  @IsString()
  contractCode?: string;

  @ApiPropertyOptional({ description: '房间编号（无合约/退租编号时按房间解析合约）' })
  @IsOptional()
  @IsString()
  roomCode?: string;

  @ApiPropertyOptional({ description: '客户名称（与 roomCode 一起缩小合约范围）' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ description: '所属退租记录 ID（可选）' })
  @IsOptional()
  @IsString()
  terminationId?: string;

  @ApiPropertyOptional({ description: '退租编号（导入时可选，与 terminationId 二选一）' })
  @IsOptional()
  @IsString()
  terminationCode?: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '数量' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional({ description: '单价（按金）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  unitAmount?: number;

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

export class UpdateContractOtherFeeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  terminationId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  unitAmount?: number;

  @ApiPropertyOptional()
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

export class ImportContractOtherFeesDto {
  @ApiProperty({ type: [CreateContractOtherFeeDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateContractOtherFeeDto)
  items!: CreateContractOtherFeeDto[];
}
