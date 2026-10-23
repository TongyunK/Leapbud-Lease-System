import {
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/** 客户表单内嵌的使用者（主要联络人） */
export class NestedOccupantDto {
  @ApiPropertyOptional({ example: 'LEUNG WING KAI' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

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

export class CreateCustomerDto {
  @ApiPropertyOptional({ example: 'CSM260485', description: '客户编号（已忽略，系统自动生成）' })
  @IsOptional()
  @IsString()
  customerCode?: string;

  @ApiProperty({ example: 'NG HO CHING' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ description: '客户经理用户 ID（必填）' })
  @IsString()
  @MinLength(1)
  accountManagerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyNameZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyNameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessRegNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessNature?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessRegCopy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rentedRooms?: string;

  @ApiProperty({ description: '所属大厦 ID（必填）' })
  @IsString()
  @MinLength(1)
  buildingId!: string;

  @ApiPropertyOptional({ description: '协议打印模板覆盖 ID；传 null/空 表示未指定' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  agreementTemplateId?: string | null;

  @ApiPropertyOptional({ description: '关联已有使用者作为主要联络人' })
  @IsOptional()
  @IsString()
  linkOccupantId?: string;

  @ApiPropertyOptional({ description: '新建使用者（未选 linkOccupantId 时建议填写）' })
  @IsOptional()
  @ValidateNested()
  @Type(() => NestedOccupantDto)
  occupant?: NestedOccupantDto;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  customerCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '客户经理用户 ID；传 null/空 表示未关联' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  accountManagerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyNameZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyNameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessRegNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessNature?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessRegCopy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rentedRooms?: string;

  @ApiPropertyOptional({ description: '所属大厦 ID；传 null/空 表示未关联' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  buildingId?: string | null;

  @ApiPropertyOptional({ description: '协议打印模板覆盖 ID；传 null/空 表示清除' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  agreementTemplateId?: string | null;

  @ApiPropertyOptional({ description: '主要使用者 ID' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  primaryOccupantId?: string | null;

  @ApiPropertyOptional({ description: '同步更新主要使用者资料' })
  @IsOptional()
  @ValidateNested()
  @Type(() => NestedOccupantDto)
  occupant?: NestedOccupantDto;

  @ApiPropertyOptional({ description: '额外关联已有使用者到本客户' })
  @IsOptional()
  @IsString()
  linkOccupantId?: string;
}

/** 批量导入客户（单批建议 ≤200） */
export class ImportCustomersDto {
  @ApiProperty({ type: [CreateCustomerDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateCustomerDto)
  items!: CreateCustomerDto[];
}
