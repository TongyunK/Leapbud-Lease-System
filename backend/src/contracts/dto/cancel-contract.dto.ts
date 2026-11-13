import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 签约中取消合约：定金结算方式（兼容旧客户端；有金额字段时以金额为准） */
export const CANCEL_BOOKING_DEPOSIT_ACTIONS = ['refund_all', 'partial', 'defer'] as const;
export type CancelBookingDepositAction = (typeof CANCEL_BOOKING_DEPOSIT_ACTIONS)[number];

/** 签约中取消合约：已收发票现金处理（兼容旧客户端；有 invoiceSettlements 时以明细为准） */
export const CANCEL_PAID_INVOICE_ACTIONS = ['refund_now', 'defer'] as const;
export type CancelPaidInvoiceAction = (typeof CANCEL_PAID_INVOICE_ACTIONS)[number];

/** 单张已收发票的另收结算：需退 + 扣除；二者都为 0 表示暂不退 */
export class CancelInvoiceSettleLineDto {
  @ApiProperty({ description: '发票 ID' })
  @IsString()
  @MinLength(1)
  invoiceId!: string;

  @ApiProperty({ description: '立刻退还的另收金额（≥0）' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  refundAmount!: number;

  @ApiProperty({ description: '扣留不退的另收金额（≥0）' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deductAmount!: number;
}

export class ConductCancelContractDto {
  @ApiProperty({ description: '取消日期 YYYY-MM-DD' })
  @IsString()
  @MinLength(1)
  cancelDate!: string;

  @ApiPropertyOptional({ description: '取消备注' })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({
    description:
      '定金余额处理（兼容）：refund_all／partial／defer；若传 bookingDepositRefundAmount 则以金额为准',
    enum: CANCEL_BOOKING_DEPOSIT_ACTIONS,
  })
  @IsOptional()
  @IsIn([...CANCEL_BOOKING_DEPOSIT_ACTIONS])
  bookingDepositAction?: CancelBookingDepositAction;

  @ApiPropertyOptional({
    description: '定金扣留金额（须 ≥0 且 ≤ 可用余额）',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bookingDepositForfeitAmount?: number;

  @ApiPropertyOptional({
    description: '定金立刻退还金额（须 ≥0；与扣留合计 ≤ 可用余额；余下为暂不退）',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bookingDepositRefundAmount?: number;

  @ApiPropertyOptional({
    description: '已收现金发票处理（兼容）：有 invoiceSettlements 时忽略',
    enum: CANCEL_PAID_INVOICE_ACTIONS,
  })
  @IsOptional()
  @IsIn([...CANCEL_PAID_INVOICE_ACTIONS])
  paidInvoiceAction?: CancelPaidInvoiceAction;

  @ApiPropertyOptional({
    description:
      '按发票结算另收：需退＋扣除；都为 0=暂不退；需退＋扣除＝另收则立刻结算（冲销收据）',
    type: [CancelInvoiceSettleLineDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CancelInvoiceSettleLineDto)
  invoiceSettlements?: CancelInvoiceSettleLineDto[];

  @ApiPropertyOptional({
    description:
      '立刻退款／冲销办理日期 YYYY-MM-DD（有即时退定时用；缺省则用 cancelDate）',
  })
  @IsOptional()
  @IsString()
  refundDate?: string;
}

/** 已取消合约：办理暂不退的后续退款 */
export class ConductCancelRefundDto {
  @ApiProperty({ description: '退款办理日期 YYYY-MM-DD' })
  @IsString()
  @MinLength(1)
  refundDate!: string;

  @ApiPropertyOptional({
    description: '冲销暂留的发票另收现金（默认：有待冲销则 true）',
  })
  @IsOptional()
  @IsBoolean()
  refundCash?: boolean;

  @ApiPropertyOptional({
    description: '退还暂留的定金可用余额（默认：有余额则 true）',
  })
  @IsOptional()
  @IsBoolean()
  refundBookingDeposit?: boolean;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ description: '打款／退款付款方式（写入退款单）' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
