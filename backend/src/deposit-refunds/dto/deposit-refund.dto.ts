import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class CreateDepositRefundDto {
  @ApiPropertyOptional({ description: '所属合约 ID（与 contractCode 二选一）' })
  @IsOptional()
  @IsString()
  contractId?: string

  @ApiPropertyOptional({ description: '所属合约编号（导入推荐）' })
  @IsOptional()
  @IsString()
  contractCode?: string

  @ApiPropertyOptional({ description: '退还编号（省略则自动生成 DRF{YYMMDD}{####}）' })
  @IsOptional()
  @IsString()
  refundCode?: string

  @ApiPropertyOptional({ description: '所属客户 ID（省略则从合约复制）' })
  @IsOptional()
  @IsString()
  customerId?: string

  @ApiPropertyOptional({ description: '所属房间 ID（省略则从合约复制）' })
  @IsOptional()
  @IsString()
  roomId?: string

  @ApiPropertyOptional({ description: '状态' })
  @IsOptional()
  @IsString()
  status?: string

  @ApiPropertyOptional({ description: '退租日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  terminationDate?: string

  @ApiPropertyOptional({ description: '退款日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  refundDate?: string

  @ApiPropertyOptional({ description: '按金总额' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalDeposit?: number

  @ApiPropertyOptional({ description: '实退按金金额' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  actualRefundAmount?: number

  @ApiPropertyOptional({ description: '处理人用户 ID' })
  @IsOptional()
  @IsString()
  handlerId?: string | null

  @ApiPropertyOptional({ description: '退还凭证图片路径' })
  @IsOptional()
  @IsString()
  voucherImage?: string

  @ApiPropertyOptional({ description: '退还凭证附件路径' })
  @IsOptional()
  @IsString()
  voucherAttachment?: string

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string
}

export class UpdateDepositRefundDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refundCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  terminationDate?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refundDate?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalDeposit?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  actualRefundAmount?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  handlerId?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  voucherImage?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  voucherAttachment?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string
}

export class ImportDepositRefundsDto {
  @ApiProperty({ type: [CreateDepositRefundDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateDepositRefundDto)
  items!: CreateDepositRefundDto[]
}
