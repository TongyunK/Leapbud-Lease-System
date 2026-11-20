import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  account!: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(1)
  password!: string;

  /** 图形验证码 ID（开启机器人验证时必填） */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  captchaId?: string;

  /** 图形验证码内容（开启机器人验证时必填） */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  captchaCode?: string;
}
