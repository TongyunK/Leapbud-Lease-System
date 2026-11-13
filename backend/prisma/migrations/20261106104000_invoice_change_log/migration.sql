-- 发票变更记录（合约按金／首期租金同步等）
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "change_log" TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN "invoices"."change_log" IS '变更记录（文本审计摘要；合约同步按金／首期租金等追加）';
