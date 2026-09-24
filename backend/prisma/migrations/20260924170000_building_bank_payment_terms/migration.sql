-- 大厦：银行名称、付款条款（发票模板 bankname / payment_terms）
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "bank_name" TEXT;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "payment_terms" TEXT;

COMMENT ON COLUMN "buildings"."bank_name" IS '银行名称（发票模板旧键 bankname）';
COMMENT ON COLUMN "buildings"."payment_terms" IS '付款条款（发票模板旧键 payment_terms）';
