-- 房间：允许短租
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "allow_short_term" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "rooms"."allow_short_term" IS '是否允许短租开票（无合约；开启后可选入短租发票）';

-- 发票：短租来源与可空合约
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'contract';
ALTER TABLE "invoices" ALTER COLUMN "contract_id" DROP NOT NULL;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "rental_start_date" DATE;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "rental_end_date" DATE;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "rental_duration_text" TEXT NOT NULL DEFAULT '';
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "referred_by_customer_id" TEXT;

COMMENT ON TABLE "invoices" IS '发票（财务：合约开票或短租开票记录）';
COMMENT ON COLUMN "invoices"."source" IS '开票来源：contract=合约发票；short_term=短租发票（无合约）';
COMMENT ON COLUMN "invoices"."contract_id" IS '所属合约 ID（短租发票可空）';
COMMENT ON COLUMN "invoices"."short_term_rental_code" IS '短租编号（短租发票自动生成；可与 invoiceCode 相同）';
COMMENT ON COLUMN "invoices"."rental_start_date" IS '短租：租赁开始日期';
COMMENT ON COLUMN "invoices"."rental_end_date" IS '短租：租赁结束日期';
COMMENT ON COLUMN "invoices"."rental_duration_text" IS '短租：描述租赁时长（文本）';
COMMENT ON COLUMN "invoices"."referred_by_customer_id" IS '短租：经此客户介绍（介绍人客户 ID）';

CREATE INDEX IF NOT EXISTS "invoices_source_idx" ON "invoices"("source");
CREATE INDEX IF NOT EXISTS "invoices_rental_start_date_idx" ON "invoices"("rental_start_date");
CREATE INDEX IF NOT EXISTS "invoices_rental_end_date_idx" ON "invoices"("rental_end_date");
CREATE INDEX IF NOT EXISTS "invoices_referred_by_customer_id_idx" ON "invoices"("referred_by_customer_id");
CREATE INDEX IF NOT EXISTS "invoices_room_id_source_rental_start_date_rental_end_date_idx"
  ON "invoices"("room_id", "source", "rental_start_date", "rental_end_date");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_referred_by_customer_id_fkey'
  ) THEN
    ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_referred_by_customer_id_fkey"
      FOREIGN KEY ("referred_by_customer_id") REFERENCES "customers"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 应收：短租可空合约
ALTER TABLE "receivables" ALTER COLUMN "contract_id" DROP NOT NULL;
COMMENT ON COLUMN "receivables"."contract_id" IS '所属合约 ID（通常与发票合约一致；短租应收可空）';
