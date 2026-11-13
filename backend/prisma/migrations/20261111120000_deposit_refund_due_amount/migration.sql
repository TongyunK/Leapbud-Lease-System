-- 按金退还：应退上限（支持分次退）；历史单用实退金额回填
ALTER TABLE "deposit_refunds"
  ADD COLUMN IF NOT EXISTS "refund_due_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0;

UPDATE "deposit_refunds"
SET "refund_due_amount" = GREATEST("actual_refund_amount", "refund_due_amount")
WHERE "refund_due_amount" = 0 AND "actual_refund_amount" > 0;

COMMENT ON COLUMN "deposit_refunds"."refund_due_amount" IS '应退按金上限（已收按金 − 扣除；分次退时的总额快照）';
COMMENT ON COLUMN "deposit_refunds"."actual_refund_amount" IS '累计已退按金金额（随分次打款回写）';
COMMENT ON COLUMN "deposit_refunds"."status" IS '状态（草稿 / 未退 / 部分已退 / 已退 / 已取消）';
COMMENT ON COLUMN "deposit_refunds"."booking_deposit_refund_amount" IS '一并退还的定金余额（挂账余款；0 表示不退定金；定金不拆分）';
