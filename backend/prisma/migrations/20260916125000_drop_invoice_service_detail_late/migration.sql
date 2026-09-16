-- 移除服务细节 LATE 字段

ALTER TABLE "invoice_service_details" DROP COLUMN IF EXISTS "late";
