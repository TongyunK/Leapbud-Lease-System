/**
 * 历史「定金抵扣」发票收据的支付方式标记。
 * 新业务不再开此类收据；同步应收时排除该方式，避免与 apply 动账双重计入。
 */
export const BOOKING_DEPOSIT_OFFSET_METHOD = '定金抵扣'
