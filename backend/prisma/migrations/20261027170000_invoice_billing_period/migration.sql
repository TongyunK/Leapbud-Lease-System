-- 发票自动开票：账单种类与租金周期
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "billing_kind" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "period_start" DATE;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "period_end" DATE;

COMMENT ON COLUMN "invoices"."billing_kind" IS '自动开票种类：manual=手工；deposit=房间按金发票；rent=缴费周期租金发票';
COMMENT ON COLUMN "invoices"."period_start" IS '租金账单周期起（仅 billingKind=rent；UTC 日期）';
COMMENT ON COLUMN "invoices"."period_end" IS '租金账单周期止（仅 billingKind=rent；UTC 日期，含当日）';

CREATE INDEX IF NOT EXISTS "invoices_billing_kind_idx" ON "invoices"("billing_kind");
CREATE INDEX IF NOT EXISTS "invoices_period_start_idx" ON "invoices"("period_start");
CREATE INDEX IF NOT EXISTS "invoices_contract_id_billing_kind_period_start_idx"
  ON "invoices"("contract_id", "billing_kind", "period_start");
