-- 删除旧系统冗余字段：各类 Logo 与 building_config
ALTER TABLE "buildings" DROP COLUMN IF EXISTS "agreement_logo";
ALTER TABLE "buildings" DROP COLUMN IF EXISTS "logo2";
ALTER TABLE "buildings" DROP COLUMN IF EXISTS "invoice_logo";
ALTER TABLE "buildings" DROP COLUMN IF EXISTS "receipt_top_logo";
ALTER TABLE "buildings" DROP COLUMN IF EXISTS "receipt_left_logo";
ALTER TABLE "buildings" DROP COLUMN IF EXISTS "receipt_right_logo";
ALTER TABLE "buildings" DROP COLUMN IF EXISTS "building_config";
