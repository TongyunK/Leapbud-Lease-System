-- 定金动账：没收／扣留（签约解除等；扣减余额，不退现金）
ALTER TYPE "BookingDepositMovementType" ADD VALUE IF NOT EXISTS 'forfeit';

COMMENT ON TYPE "BookingDepositMovementType" IS '定金动账类型：apply=抵扣应收，refund=退还，top_up=加收入账，forfeit=没收／扣留';
COMMENT ON COLUMN "booking_deposit_movements"."type" IS '动账类型：apply=抵扣应收，refund=退还，top_up=加收入账，forfeit=没收／扣留';
