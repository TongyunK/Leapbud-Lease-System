import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'user01' })
  @IsString()
  @MinLength(2)
  account!: string;

  @ApiProperty({ example: 'Pass1234' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({ example: 'Staff User' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ description: '角色编码（对应角色管理 roles.code）', example: 'user' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.active })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ type: [String], description: '可访问的大厦；管理员忽略此字段' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  buildingIds?: string[];
}
