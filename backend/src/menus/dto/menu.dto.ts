import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MenuType } from '@prisma/client';

export class CreateMenuDto {
  @ApiPropertyOptional({ description: '上级菜单 ID' })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiProperty({ enum: MenuType, example: MenuType.menu })
  @IsEnum(MenuType)
  type!: MenuType;

  @ApiProperty({ example: '用戶管理', description: '中文名称' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 'Users', description: '英文名称' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional({ example: 'menu.users' })
  @IsOptional()
  @IsString()
  nameKey?: string;

  @ApiPropertyOptional({ example: 'users' })
  @IsOptional()
  @IsString()
  routeName?: string;

  @ApiPropertyOptional({ example: 'system/users' })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  permission?: string;
}

export class UpdateMenuDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({ enum: MenuType })
  @IsOptional()
  @IsEnum(MenuType)
  type?: MenuType;

  @ApiPropertyOptional({ description: '中文名称' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ description: '英文名称' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  routeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  permission?: string;
}

/** 菜单拖拽排序单项 */
export class ReorderMenuItemDto {
  @ApiProperty({ description: '菜单 ID' })
  @IsString()
  id!: string;

  @ApiProperty({ description: '同级排序（越小越靠前）' })
  @Type(() => Number)
  @IsInt()
  sortOrder!: number;
}

/** 批量更新菜单排序 */
export class ReorderMenusDto {
  @ApiProperty({ type: [ReorderMenuItemDto], description: '同级菜单排序列表' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderMenuItemDto)
  items!: ReorderMenuItemDto[];
}
