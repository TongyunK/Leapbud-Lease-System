-- 结算单：status → refund_status；新增 collect_status / collected_total

ALTER TYPE "ContractSettlementStatus" RENAME TO "ContractSettlementRefundStatus";

ALTER TABLE "contract_settlements" RENAME COLUMN "status" TO "refund_status";

DROP INDEX IF EXISTS "contract_settlements_status_idx";
CREATE INDEX "contract_settlements_refund_status_idx" ON "contract_settlements"("refund_status");

CREATE TYPE "ContractSettlementCollectStatus" AS ENUM (
  'none',
  'pending_collect',
  'partial',
  'settled'
);

ALTER TABLE "contract_settlements"
  ADD COLUMN "collected_total" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "collect_status" "ContractSettlementCollectStatus" NOT NULL DEFAULT 'none';

CREATE INDEX "contract_settlements_collect_status_idx" ON "contract_settlements"("collect_status");

-- 回填已收：ADDITIONAL_CHARGE 关联应收 received_amount 合计
UPDATE "contract_settlements" s
SET "collected_total" = COALESCE((
  SELECT ROUND(SUM(r."received_amount")::numeric, 2)
  FROM "contract_settlement_items" i
  INNER JOIN "receivables" r ON r."id" = i."receivable_id"
  WHERE i."settlement_id" = s."id"
    AND i."item_type" = 'ADDITIONAL_CHARGE'
    AND i."receivable_id" IS NOT NULL
), 0);

UPDATE "contract_settlements"
SET "collect_status" = CASE
  WHEN "collect_due_total" <= 0.009 THEN 'none'::"ContractSettlementCollectStatus"
  WHEN "collected_total" <= 0.009 THEN 'pending_collect'::"ContractSettlementCollectStatus"
  WHEN "collected_total" + 0.009 < "collect_due_total" THEN 'partial'::"ContractSettlementCollectStatus"
  ELSE 'settled'::"ContractSettlementCollectStatus"
END;

COMMENT ON TYPE "ContractSettlementRefundStatus" IS '合约终止结算应退状态：pending_refund=待退款，settled=应退已结清';
COMMENT ON TYPE "ContractSettlementCollectStatus" IS '合约终止结算应收（应补）状态：none=无应补，pending_collect=待收，partial=部分收，settled=已收清';
COMMENT ON COLUMN "contract_settlements"."refund_status" IS '应退状态：pending_refund=待退款，settled=应退已结清';
COMMENT ON COLUMN "contract_settlements"."collect_status" IS '应收（应补）状态：none=无应补，pending_collect=待收，partial=部分收，settled=已收清';
COMMENT ON COLUMN "contract_settlements"."collected_total" IS '应补已收合计（由 ADDITIONAL_CHARGE 关联应收回写）';
COMMENT ON COLUMN "contract_settlements"."collect_due_total" IS '客户应补缴合计';
