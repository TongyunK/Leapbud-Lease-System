-- 发票：旧系统简道云 _id，供服务细节等按旧 ID 关联
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "legacy_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_legacy_id_key" ON "invoices"("legacy_id");

COMMENT ON COLUMN "invoices"."legacy_id" IS '旧系统记录 ID（简道云 _id；服务细节 JSON 按此关联所属发票）';
