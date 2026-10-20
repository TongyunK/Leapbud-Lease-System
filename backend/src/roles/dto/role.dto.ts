import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateRoleDto {
  @ApiProperty({ example: 'ops' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: '运营' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class AssignRoleMenusDto {
  @ApiProperty({ type: [String], description: '菜单 ID 列表' })
  @IsArray()
  @IsString({ each: true })
  menuIds!: string[];
}

export class AssignRolePermissionsDto {
  @ApiProperty({ type: [String], description: '功能权限 code 列表，如 customers:create' })
  @IsArray()
  @IsString({ each: true })
  codes!: string[];
}

export class RoleMenuGrantDto {
  @ApiProperty()
  @IsString()
  roleId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  menuIds!: string[];
}

export class SaveRoleMenuMatrixDto {
  @ApiProperty({ type: [RoleMenuGrantDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleMenuGrantDto)
  grants!: RoleMenuGrantDto[];
}
