import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class ForgotPasswordSendCodeDto {
  /** 登录账号（须已绑定邮箱） */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  account!: string

  /** 界面语言：zh-TW | en（决定邮件与接口提示文案） */
  @IsOptional()
  @IsString()
  @IsIn(['zh-TW', 'en'])
  locale?: string
}

export class ForgotPasswordResetDto {
  /** 登录账号（须与发码时一致） */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  account!: string

  /** 邮箱收到的 6 位验证码 */
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  code!: string

  /** 新密码（至少 6 位） */
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  newPassword!: string

  /** 界面语言：zh-TW | en（决定接口提示文案） */
  @IsOptional()
  @IsString()
  @IsIn(['zh-TW', 'en'])
  locale?: string
}
