import { Type } from 'class-transformer'
import {
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

export class CreateWhatsappBusinessNumberDto {
  @ApiProperty({ example: '環薈主號' })
  @IsString()
  @MinLength(1)
  label!: string

  @ApiProperty({ example: '85265500398', description: '含区号' })
  @IsString()
  @MinLength(1)
  phoneNumber!: string

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

export class UpdateWhatsappBusinessNumberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  phoneNumber?: string

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

/** 拖拽排序单项 */
export class ReorderWhatsappBusinessNumberItemDto {
  @ApiProperty({ description: '商业号码 ID' })
  @IsString()
  id!: string

  @ApiProperty({ description: '排序权重（越小越靠前）' })
  @Type(() => Number)
  @IsInt()
  sortOrder!: number
}

/** 批量更新商业号码排序 */
export class ReorderWhatsappBusinessNumbersDto {
  @ApiProperty({ type: [ReorderWhatsappBusinessNumberItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderWhatsappBusinessNumberItemDto)
  items!: ReorderWhatsappBusinessNumberItemDto[]
}
