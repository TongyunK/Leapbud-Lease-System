import {
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateBuildingDto {
  @ApiProperty({ example: '環薈中心' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manager?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workingHours?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fpsId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountHolder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiTemplateSuffix?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  useWbaNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buildingConfig?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chequePaymentBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentAdvice?: string;

  @ApiPropertyOptional({ description: '协议模板 ID；空字符串清除' })
  @IsOptional()
  @IsString()
  agreementTemplateId?: string | null;

  @ApiPropertyOptional({ description: '发票模板 ID；空字符串清除' })
  @IsOptional()
  @IsString()
  invoiceTemplateId?: string | null;

  @ApiPropertyOptional({ description: '收据模板 ID；空字符串清除' })
  @IsOptional()
  @IsString()
  receiptTemplateId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateBuildingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manager?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workingHours?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fpsId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountHolder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiTemplateSuffix?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  useWbaNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buildingConfig?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chequePaymentBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentAdvice?: string;

  @ApiPropertyOptional({ description: '协议模板 ID；空字符串清除' })
  @IsOptional()
  @IsString()
  agreementTemplateId?: string | null;

  @ApiPropertyOptional({ description: '发票模板 ID；空字符串清除' })
  @IsOptional()
  @IsString()
  invoiceTemplateId?: string | null;

  @ApiPropertyOptional({ description: '收据模板 ID；空字符串清除' })
  @IsOptional()
  @IsString()
  receiptTemplateId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ImportBuildingsDto {
  @ApiProperty({ type: [CreateBuildingDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateBuildingDto)
  items!: CreateBuildingDto[];
}
