import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { DocumentTemplateType } from '@prisma/client';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return undefined;
}

export class CreateDocumentTemplateDto {
  @ApiProperty({ example: 'SP 办公室服务协议' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: DocumentTemplateType, example: DocumentTemplateType.agreement })
  @IsEnum(DocumentTemplateType)
  type!: DocumentTemplateType;

  @ApiPropertyOptional({ description: '是否启用', default: true })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateDocumentTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ enum: DocumentTemplateType })
  @IsOptional()
  @IsEnum(DocumentTemplateType)
  type?: DocumentTemplateType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class PrintAgreementDto {
  @ApiProperty({ description: '合约 ID' })
  @IsString()
  @MinLength(1)
  contractId!: string;

  @ApiPropertyOptional({ enum: ['docx', 'pdf'], default: 'docx' })
  @IsOptional()
  @IsIn(['docx', 'pdf'])
  format?: 'docx' | 'pdf';
}

export class PrintInvoiceDto {
  @ApiProperty({ description: '发票 ID' })
  @IsString()
  @MinLength(1)
  invoiceId!: string;

  @ApiPropertyOptional({ enum: ['docx', 'pdf'], default: 'docx' })
  @IsOptional()
  @IsIn(['docx', 'pdf'])
  format?: 'docx' | 'pdf';
}

export class DocumentTemplateDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: DocumentTemplateType })
  type!: DocumentTemplateType;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  storageKey!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty()
  remark!: string;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  updatedBy!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
