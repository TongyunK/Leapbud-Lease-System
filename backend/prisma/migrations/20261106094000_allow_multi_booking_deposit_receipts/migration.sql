-- 加收定金可新开多张定金收据：去掉「同一合约仅一张 booking_deposit」唯一约束
DROP INDEX IF EXISTS "receipts_contract_booking_deposit_uidx";

-- 保留查询用非唯一索引（合约 + 定金收据）
CREATE INDEX IF NOT EXISTS "receipts_contract_id_kind_idx"
  ON "receipts"("contract_id", "kind");

COMMENT ON COLUMN "contracts"."booking_deposit_receipt_id" IS '首张定金收据 ID（一对一便捷指针；同合约可另有多张加收定金收据）';
