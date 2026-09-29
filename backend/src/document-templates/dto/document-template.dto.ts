import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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

/** 协议预览草稿中的合约期（来自编辑弹窗未保存内容） */
export class AgreementPreviewPeriodDto {
  @ApiPropertyOptional({ example: '使用期' })
  @IsOptional()
  @IsString()
  dateType?: string;

  @ApiPropertyOptional({ example: '月' })
  @IsOptional()
  @IsString()
  dateUnit?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dateValue?: number;

  @ApiPropertyOptional({ example: '2026-05-22' })
  @IsOptional()
  @IsString()
  startDate?: string | null;

  @ApiPropertyOptional({ example: '2027-05-21' })
  @IsOptional()
  @IsString()
  endDate?: string | null;
}

/**
 * 协议预览草稿：用编辑弹窗当前表单覆盖库内已存值。
 * 传入 draft 时，合约业务字段以 draft 为准（含空值），客户/房间按 draft 的 ID 重新解析。
 */
export class AgreementPreviewDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  roomId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  customerId?: string;

  @ApiPropertyOptional({ example: '2026-09-11' })
  @IsOptional()
  @IsString()
  startDate?: string | null;

  @ApiPropertyOptional({ example: '2027-09-10' })
  @IsOptional()
  @IsString()
  endDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leaseType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentCycle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  monthlyRent?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  roomDeposit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bookingDeposit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  miscDeposit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  electricityRate?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  doorKeyQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mailboxKeyQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomNameText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ type: [AgreementPreviewPeriodDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgreementPreviewPeriodDto)
  periods?: AgreementPreviewPeriodDto[];
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

  @ApiPropertyOptional({
    description: '编辑弹窗草稿；传入时按未保存表单内容填充模板',
    type: AgreementPreviewDraftDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgreementPreviewDraftDto)
  draft?: AgreementPreviewDraftDto;
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

export class PrintReceiptDto {
  @ApiProperty({ description: '收据 ID' })
  @IsString()
  @MinLength(1)
  receiptId!: string;

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
