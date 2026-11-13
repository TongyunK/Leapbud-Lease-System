-- 合约终止结算状态收成两态：pending_refund（待退款）／settled（已结清）
-- 旧 executed／cancelled 一律归为 settled

UPDATE "contract_settlements"
SET "status" = 'settled'::"ContractSettlementStatus"
WHERE "status"::text IN ('executed', 'cancelled');

CREATE TYPE "ContractSettlementStatus_new" AS ENUM ('pending_refund', 'settled');

ALTER TABLE "contract_settlements"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "contract_settlements"
  ALTER COLUMN "status" TYPE "ContractSettlementStatus_new"
  USING ("status"::text::"ContractSettlementStatus_new");

DROP TYPE "ContractSettlementStatus";

ALTER TYPE "ContractSettlementStatus_new" RENAME TO "ContractSettlementStatus";

ALTER TABLE "contract_settlements"
  ALTER COLUMN "status" SET DEFAULT 'settled'::"ContractSettlementStatus";

COMMENT ON TYPE "ContractSettlementStatus" IS '合约终止结算状态：pending_refund=待退款，settled=已结清';
COMMENT ON COLUMN "contract_settlements"."status" IS '状态：pending_refund=待退款，settled=已结清';
