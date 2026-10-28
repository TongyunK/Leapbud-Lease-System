import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

export class UpdateSystemSettingsDto {
  /** 租金自动开票提前天数（距下一缴费周期开始日；含当天；1–90） */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  rentInvoiceLeadDays!: number
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
