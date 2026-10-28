-- 合约定金收款：收款凭证附件
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "payment_voucher" TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN "contracts"."payment_voucher" IS '定金收款凭证（图片或文件路径）';
