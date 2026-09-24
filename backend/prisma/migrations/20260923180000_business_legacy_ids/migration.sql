-- 旧系统简道云 _id 映射（工程师 JSON 全量导入用；业务 Excel 不依赖此字段）

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "room_config_options" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "occupants" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "customer_requirements" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "contract_periods" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "lease_terminations" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "contract_other_fees" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "deposit_refunds" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "invoice_service_details" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;
ALTER TABLE "receipts" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_legacy_id_key" ON "users"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "buildings_legacy_id_key" ON "buildings"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_legacy_id_key" ON "rooms"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "room_config_options_legacy_id_key" ON "room_config_options"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "customers_legacy_id_key" ON "customers"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "occupants_legacy_id_key" ON "occupants"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_requirements_legacy_id_key" ON "customer_requirements"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "contracts_legacy_id_key" ON "contracts"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "contract_periods_legacy_id_key" ON "contract_periods"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "lease_terminations_legacy_id_key" ON "lease_terminations"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "contract_other_fees_legacy_id_key" ON "contract_other_fees"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "deposit_refunds_legacy_id_key" ON "deposit_refunds"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_service_details_legacy_id_key" ON "invoice_service_details"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "receivables_legacy_id_key" ON "receivables"("legacy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "receipts_legacy_id_key" ON "receipts"("legacy_id");

COMMENT ON COLUMN "users"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "buildings"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "rooms"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "room_config_options"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "customers"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "occupants"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "customer_requirements"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "contracts"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "contract_periods"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "lease_terminations"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "contract_other_fees"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "deposit_refunds"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "invoice_service_details"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "receivables"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
COMMENT ON COLUMN "receipts"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用）';
