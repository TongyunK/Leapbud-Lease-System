import {
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateOccupantDto {
  @ApiProperty({ example: 'LEUNG WING KAI' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ description: '所属客户 ID' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: '客户编号（无 customerId 时用于关联）' })
  @IsOptional()
  @IsString()
  customerCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relatedCustomerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobilePhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fax?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idCardNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idCardImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressProofCopy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateOccupantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  customerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relatedCustomerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobilePhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fax?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idCardNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idCardImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressProofCopy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

/** 批量导入使用者（单批建议 ≤200；重复则跳过） */
export class ImportOccupantsDto {
  @ApiProperty({ type: [CreateOccupantDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateOccupantDto)
  items!: CreateOccupantDto[];
}
