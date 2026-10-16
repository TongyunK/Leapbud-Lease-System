import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NumberingBizKey, NumberingResetCycle } from '@prisma/client';

export class CreateNumberingRuleDto {
  @ApiProperty({ example: '客戶編號' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'CSM%YY%04d' })
  @IsString()
  @MinLength(1)
  format!: string;

  @ApiPropertyOptional({ enum: NumberingBizKey })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsEnum(NumberingBizKey)
  bizKey?: NumberingBizKey;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  startValue?: number;

  @ApiPropertyOptional({ enum: NumberingResetCycle })
  @IsOptional()
  @IsEnum(NumberingResetCycle)
  resetCycle?: NumberingResetCycle;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateNumberingRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  format?: string;

  @ApiPropertyOptional({ enum: NumberingBizKey, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsEnum(NumberingBizKey)
  bizKey?: NumberingBizKey | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  startValue?: number;

  @ApiPropertyOptional({ description: '当前已用序号（下次生成取 currentSeq+1）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  currentSeq?: number;

  @ApiPropertyOptional({ enum: NumberingResetCycle })
  @IsOptional()
  @IsEnum(NumberingResetCycle)
  resetCycle?: NumberingResetCycle;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
