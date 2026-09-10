import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
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

  @ApiProperty({ example: '用戶管理' })
  @IsString()
  @MinLength(1)
  name!: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

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
