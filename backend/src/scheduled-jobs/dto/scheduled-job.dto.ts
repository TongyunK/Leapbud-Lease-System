import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

const RECURRENCES = ['daily', 'weekly', 'monthly_days', 'monthly_weekday', 'yearly'] as const

export class UpdateScheduledJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsIn(RECURRENCES)
  recurrence?: (typeof RECURRENCES)[number]

  /** HH:mm */
  @IsOptional()
  @Matches(/^\d{1,2}:\d{2}$/)
  runTime?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  recurrenceConfig?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string
}
