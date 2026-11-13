-- 回填：已退一部分且未退齐 → partial（须在 ADD VALUE 提交之后）

UPDATE "contract_settlements"
SET "refund_status" = 'partial'::"ContractSettlementRefundStatus"
WHERE "refund_due_total" > 0.009
  AND "refunded_total" > 0.009
  AND "refunded_total" + 0.009 < "refund_due_total";
