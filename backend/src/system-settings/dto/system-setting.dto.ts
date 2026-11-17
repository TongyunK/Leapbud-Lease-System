import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export class UpdateMailSmtpDto {
  /** SMTP 主机，如 mail.wisesystemtech.com */
  @IsString()
  @MaxLength(200)
  host!: string

  /** SMTP 端口 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number

  /** true=SSL（465）；false=STARTTLS（587） */
  @IsBoolean()
  secure!: boolean

  /** 发件／登录邮箱（对应键 mail_sending_email） */
  @IsString()
  @MaxLength(200)
  email!: string

  /**
   * SMTP 密码。留空或 ******** 表示不修改已保存密码。
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string

  /** 发件人显示名 */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromName?: string
}

export class UpdateBrandingDto {
  /** uploads 相对键；空字符串表示恢复默认 Logo */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoKey?: string

  /** 主题色 #RRGGBB */
  @IsString()
  @MaxLength(7)
  themeColor!: string

  /** 公司名称（登录小字 / 侧栏主名） */
  @IsString()
  @MaxLength(80)
  title!: string

  /** 系统名称（侧栏副标；登录大标题 = 公司名称 + 空格 + 系统名称） */
  @IsString()
  @MaxLength(120)
  subtitle!: string
}

export class UpdateSystemSettingsDto {
  /** 租金自动开票提前天数（距下一缴费周期开始日；含当天；1–90） */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  rentInvoiceLeadDays!: number

  /** 可选：一并保存邮件 SMTP */
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateMailSmtpDto)
  mailSmtp?: UpdateMailSmtpDto

  /** 可选：一并保存品牌外观 */
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateBrandingDto)
  branding?: UpdateBrandingDto
}

export class UpdateContractExpiringSoonDto {
  /** 提前量：1–365（天）或 1–36（月） */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  amount!: number

  @IsIn(['day', 'month'])
  unit!: 'day' | 'month'

  @IsIn(['all', 'include', 'exclude'])
  statusMode!: 'all' | 'include' | 'exclude'

  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  statuses!: string[]
}
