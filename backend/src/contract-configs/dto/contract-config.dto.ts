import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContractConfigType } from '@prisma/client';

export class CreateContractConfigDto {
  @ApiProperty({ enum: ContractConfigType })
  @IsEnum(ContractConfigType)
  type!: ContractConfigType;

  @ApiPropertyOptional({ description: '稳定业务码；钥匙按金建议 door_key / mailbox_key' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  label!: string;

  @ApiPropertyOptional({ description: '仅 keyDeposit 使用' })
  @IsOptional()
  @IsNumber()
  unitPrice?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateContractConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  unitPrice?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
