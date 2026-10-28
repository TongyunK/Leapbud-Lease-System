-- 合约增加收款方式
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "payment_method" TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN "contracts"."payment_cycle" IS '缴费周期：月繳-1 / 季繳-3 / 半年繳-6 / 年繳-12 / 1年半-18 / 2年-24';
COMMENT ON COLUMN "contracts"."payment_method" IS '收款方式：轉數快 / 銀行過數 / 支票 / 現金';
