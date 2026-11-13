-- 回填：历史「定金抵扣超出按金金额赔偿」从 PENALTY_DEDUCTION 改为 BOOKING_DEPOSIT_OFFSET，
-- 并重算受影响结算的 deduction_total（不含定金抵扣）

UPDATE "contract_settlement_items"
SET "item_type" = 'BOOKING_DEPOSIT_OFFSET'::"ContractSettlementItemType"
WHERE "remark" = 'booking_offset_excess'
  AND "item_type" = 'PENALTY_DEDUCTION'::"ContractSettlementItemType";

UPDATE "contract_settlements" cs
SET "deduction_total" = COALESCE((
  SELECT SUM(csi."amount")
  FROM "contract_settlement_items" csi
  WHERE csi."settlement_id" = cs."id"
    AND csi."item_type" IN (
      'DAMAGE_DEDUCTION'::"ContractSettlementItemType",
      'PENALTY_DEDUCTION'::"ContractSettlementItemType"
    )
), 0)
WHERE EXISTS (
  SELECT 1
  FROM "contract_settlement_items" csi
  WHERE csi."settlement_id" = cs."id"
    AND (
      csi."item_type" = 'BOOKING_DEPOSIT_OFFSET'::"ContractSettlementItemType"
      OR csi."remark" = 'booking_offset_excess'
    )
);

COMMENT ON TYPE "ContractSettlementItemType" IS '合约结算明细类型（损坏／罚金扣款、定金抵扣、豁免、追加、应退、作废应收）';
