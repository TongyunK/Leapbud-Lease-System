-- 退租办理编排：退租类型、按金退还 FK、借出验收追溯字段

ALTER TABLE "lease_terminations"
  ADD COLUMN IF NOT EXISTS "termination_kind" TEXT NOT NULL DEFAULT 'expiry',
  ADD COLUMN IF NOT EXISTS "deposit_refund_id" TEXT;

ALTER TABLE "contract_other_fees"
  ADD COLUMN IF NOT EXISTS "return_status" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "source_loan_fee_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "lease_terminations_deposit_refund_id_key"
  ON "lease_terminations"("deposit_refund_id");

CREATE INDEX IF NOT EXISTS "contract_other_fees_source_loan_fee_id_idx"
  ON "contract_other_fees"("source_loan_fee_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lease_terminations_deposit_refund_id_fkey'
  ) THEN
    ALTER TABLE "lease_terminations"
      ADD CONSTRAINT "lease_terminations_deposit_refund_id_fkey"
      FOREIGN KEY ("deposit_refund_id") REFERENCES "deposit_refunds"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN "lease_terminations"."termination_kind" IS '退租类型：expiry=到期退租，early=提前退租';
COMMENT ON COLUMN "lease_terminations"."deposit_refund_id" IS '关联按金退还办理单 ID（一退租至多一单）';
COMMENT ON COLUMN "lease_terminations"."related_deposit_refund" IS '关联退按金单编号/引用（兼容旧数据；正式关联见 deposit_refund_id）';
COMMENT ON COLUMN "contract_other_fees"."return_status" IS '退租验收状态（扣除行）：returned=已归还，damaged=损坏扣除，missing=未归还扣除；借出原行为空';
COMMENT ON COLUMN "contract_other_fees"."source_loan_fee_id" IS '来源借出物品 ID（退租扣除行可追溯原借出行）';
