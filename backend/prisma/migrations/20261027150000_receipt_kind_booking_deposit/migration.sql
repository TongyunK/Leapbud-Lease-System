-- 收据分类：定金收据 / 发票收据
CREATE TYPE "ReceiptKind" AS ENUM ('booking_deposit', 'invoice');

COMMENT ON TYPE "ReceiptKind" IS '收据分类：booking_deposit=定金收据，invoice=发票收据';

ALTER TABLE "receipts"
  ADD COLUMN IF NOT EXISTS "kind" "ReceiptKind" NOT NULL DEFAULT 'invoice';

COMMENT ON COLUMN "receipts"."kind" IS '收据分类：booking_deposit=定金收据，invoice=发票收据';

CREATE INDEX IF NOT EXISTS "receipts_kind_idx" ON "receipts"("kind");

-- 同一合约最多一张定金收据
CREATE UNIQUE INDEX IF NOT EXISTS "receipts_contract_booking_deposit_uidx"
  ON "receipts"("contract_id")
  WHERE "kind" = 'booking_deposit' AND "contract_id" IS NOT NULL;

-- 合约 → 定金收据一对一指针
ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "booking_deposit_receipt_id" TEXT;

COMMENT ON COLUMN "contracts"."booking_deposit_receipt_id" IS '定金收据 ID（开单时生成；一对一便捷指针）';

CREATE UNIQUE INDEX IF NOT EXISTS "contracts_booking_deposit_receipt_id_key"
  ON "contracts"("booking_deposit_receipt_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_booking_deposit_receipt_id_fkey'
  ) THEN
    ALTER TABLE "contracts"
      ADD CONSTRAINT "contracts_booking_deposit_receipt_id_fkey"
      FOREIGN KEY ("booking_deposit_receipt_id") REFERENCES "receipts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
