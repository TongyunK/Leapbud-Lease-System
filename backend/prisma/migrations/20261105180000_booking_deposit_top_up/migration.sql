-- 定金动账：加收／入账（累加收据本金；不参与余额减法）
ALTER TYPE "BookingDepositMovementType" ADD VALUE IF NOT EXISTS 'top_up';

COMMENT ON TYPE "BookingDepositMovementType" IS '定金动账类型：apply=抵扣应收，refund=退还，top_up=加收入账';
COMMENT ON COLUMN "booking_deposit_movements"."type" IS '动账类型：apply=抵扣应收，refund=退还，top_up=加收入账';
