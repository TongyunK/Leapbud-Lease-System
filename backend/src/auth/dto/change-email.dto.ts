import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeEmailDto {
  @ApiProperty({ description: '新邮箱地址' })
  @IsString()
  email!: string;

  @ApiProperty({ description: '目前登录密码（用于确认身份）' })
  @IsString()
  @MinLength(1)
  currentPassword!: string;
}
