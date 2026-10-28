-- 合约增加已收订金的收款日期；订金注释改为已收订金
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "payment_date" DATE;

COMMENT ON COLUMN "contracts"."booking_deposit" IS '已收订金';
COMMENT ON COLUMN "contracts"."payment_date" IS '已收订金的收款日期';
