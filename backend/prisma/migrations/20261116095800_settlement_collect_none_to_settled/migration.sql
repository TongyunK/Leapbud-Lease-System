-- 应收状态：无应补（none）并入已结清（settled）；默认改为 settled
-- 保留 enum 值 none 以兼容历史，新数据不再写入

UPDATE "contract_settlements"
SET "collect_status" = 'settled'::"ContractSettlementCollectStatus"
WHERE "collect_status" = 'none'::"ContractSettlementCollectStatus";

ALTER TABLE "contract_settlements"
  ALTER COLUMN "collect_status" SET DEFAULT 'settled'::"ContractSettlementCollectStatus";

COMMENT ON TYPE "ContractSettlementCollectStatus" IS '合约终止结算应收状态：pending_collect=待收款，partial=部分收款，settled=已结清（含无应补）；none=历史废弃';
COMMENT ON COLUMN "contract_settlements"."collect_status" IS '应收（应补）状态：pending_collect=待收，partial=部分收款，settled=已结清（含无应补）';
