import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCustomerRequirementDto {
  @ApiPropertyOptional({ example: 'REQ2609100001' })
  @IsOptional()
  @IsString()
  requirementCode?: string;

  @ApiProperty({ example: 'clx...' })
  @IsString()
  @MinLength(1)
  customerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  salesManagerId?: string | null;

  @ApiPropertyOptional({ example: '2026-09-10' })
  @IsOptional()
  @IsString()
  requirementDate?: string | null;

  @ApiPropertyOptional({ example: '跟進中' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'long', description: 'long 长租 / short 短租' })
  @IsOptional()
  @IsString()
  rentalType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leaseDuration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  budget?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  sizeConfigId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  acConfigId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  windowConfigId?: string | null;
}

export class UpdateCustomerRequirementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  requirementCode?: string;

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
  @IsString()
  requirementDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'long', description: 'long 长租 / short 短租' })
  @IsOptional()
  @IsString()
  rentalType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leaseDuration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  budget?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  sizeConfigId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  acConfigId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  windowConfigId?: string | null;
}

/** 批量导入单行（Excel 友好：客户编号或客户名称 / 经理与配置用名称） */
export class ImportCustomerRequirementItemDto {
  @ApiPropertyOptional({ example: 'REQ2609100001' })
  @IsOptional()
  @IsString()
  requirementCode?: string;

  @ApiPropertyOptional({ example: 'CSM260001' })
  @IsOptional()
  @IsString()
  customerCode?: string;

  @ApiPropertyOptional({ example: 'Sample Customer', description: '无客户编号时按名称匹配（旧系统导出）' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ description: '销售经理显示名或账号' })
  @IsOptional()
  @IsString()
  salesManager?: string;

  @ApiPropertyOptional({ example: '2026-09-10' })
  @IsOptional()
  @IsString()
  requirementDate?: string | null;

  @ApiPropertyOptional({ example: '跟進中' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'long', description: 'long / short / 長租 / 短租' })
  @IsOptional()
  @IsString()
  rentalType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leaseDuration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  budget?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachment?: string;

  @ApiPropertyOptional({ description: '房间大小配置 label' })
  @IsOptional()
  @IsString()
  sizeConfig?: string;

  @ApiPropertyOptional({ description: '空调配置 label' })
  @IsOptional()
  @IsString()
  acConfig?: string;

  @ApiPropertyOptional({ description: '窗配置 label' })
  @IsOptional()
  @IsString()
  windowConfig?: string;
}

/** 批量导入客户需求（单批建议 ≤200；有编号则按编号 upsert） */
export class ImportCustomerRequirementsDto {
  @ApiProperty({ type: [ImportCustomerRequirementItemDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportCustomerRequirementItemDto)
  items!: ImportCustomerRequirementItemDto[];
}
