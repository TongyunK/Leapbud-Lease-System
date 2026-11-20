import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

const CODE_PATTERN = /^[a-z][a-z0-9_]{1,63}$/

export const WHATSAPP_CATEGORY_BADGE_TONES = [
  'idle',
  'signing',
  'contracting',
  'leased',
  'leasing',
  'terminating',
  'active',
  'disabled',
  'neutral',
] as const

export type WhatsappCategoryBadgeTone = (typeof WHATSAPP_CATEGORY_BADGE_TONES)[number]

export class CreateWhatsappTemplateCategoryDto {
  @ApiProperty({ example: 'monthly_invoice', description: '稳定编码（小写字母开头，仅小写/数字/下划线）' })
  @IsString()
  @MinLength(2)
  @Matches(CODE_PATTERN, {
    message: 'code must be lowercase snake_case starting with a letter',
  })
  code!: string

  @ApiProperty({ example: '月度賬單發送' })
  @IsString()
  @MinLength(1)
  label!: string

  @ApiPropertyOptional({
    description: '列表胶囊色调',
    enum: WHATSAPP_CATEGORY_BADGE_TONES,
    default: 'neutral',
  })
  @IsOptional()
  @IsString()
  @IsIn(WHATSAPP_CATEGORY_BADGE_TONES)
  badgeTone?: WhatsappCategoryBadgeTone

  @ApiPropertyOptional({ description: '说明／备注' })
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean
}

export class UpdateWhatsappTemplateCategoryDto {
  @ApiPropertyOptional({ description: '稳定编码（小写字母开头，仅小写/数字/下划线）' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @Matches(CODE_PATTERN, {
    message: 'code must be lowercase snake_case starting with a letter',
  })
  code?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string

  @ApiPropertyOptional({
    description: '列表胶囊色调',
    enum: WHATSAPP_CATEGORY_BADGE_TONES,
  })
  @IsOptional()
  @IsString()
  @IsIn(WHATSAPP_CATEGORY_BADGE_TONES)
  badgeTone?: WhatsappCategoryBadgeTone

  @ApiPropertyOptional({ description: '说明／备注' })
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean
}

export class ReorderWhatsappTemplateCategoryItemDto {
  @ApiProperty({ description: '分类 ID' })
  @IsString()
  id!: string

  @ApiProperty({ description: '排序权重（越小越靠前）' })
  @Type(() => Number)
  @IsInt()
  sortOrder!: number
}

export class ReorderWhatsappTemplateCategoriesDto {
  @ApiProperty({ type: [ReorderWhatsappTemplateCategoryItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderWhatsappTemplateCategoryItemDto)
  items!: ReorderWhatsappTemplateCategoryItemDto[]
}
