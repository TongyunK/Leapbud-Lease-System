import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateWhatsappTemplateDto {
  @ApiProperty({ description: '关联大厦 ID 列表（至少一座）', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  buildingIds!: string[]

  @ApiProperty({ description: '模板分类 ID' })
  @IsString()
  @MinLength(1)
  categoryId!: string

  @ApiProperty({ example: '環薈月度賬單' })
  @IsString()
  @MinLength(1)
  label!: string

  @ApiProperty({ example: 'ceo06_monthly_inv', description: '发送用模板名称' })
  @IsString()
  @MinLength(1)
  templateName!: string

  @ApiPropertyOptional({ description: '说明／备注' })
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional({ description: '示意图 uploads 相对键；空字符串清除' })
  @IsOptional()
  @IsString()
  diagramKey?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean
}

export class UpdateWhatsappTemplateDto {
  @ApiPropertyOptional({ description: '关联大厦 ID 列表（至少一座）', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  buildingIds?: string[]

  @ApiPropertyOptional({ description: '模板分类 ID' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  categoryId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  templateName?: string

  @ApiPropertyOptional({ description: '说明／备注' })
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional({ description: '示意图 uploads 相对键；空字符串清除' })
  @IsOptional()
  @IsString()
  diagramKey?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean
}

/** 拖拽排序单项 */
export class ReorderWhatsappTemplateItemDto {
  @ApiProperty({ description: '模板 ID' })
  @IsString()
  id!: string

  @ApiProperty({ description: '排序权重（越小越靠前）' })
  @Type(() => Number)
  @IsInt()
  sortOrder!: number
}

/** 批量更新发送模板排序 */
export class ReorderWhatsappTemplatesDto {
  @ApiProperty({ type: [ReorderWhatsappTemplateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderWhatsappTemplateItemDto)
  items!: ReorderWhatsappTemplateItemDto[]
}
