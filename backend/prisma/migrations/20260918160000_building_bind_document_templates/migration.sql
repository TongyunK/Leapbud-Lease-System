-- 大厦模板改为绑定单据模板 ID；单据模板去除所属大厦 / 大厦默认

-- 1) 大厦新增 FK 列
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "agreement_template_id" TEXT;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "invoice_template_id" TEXT;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "receipt_template_id" TEXT;

COMMENT ON COLUMN "buildings"."agreement_template_id" IS '协议书模板 ID（绑定单据模板库）';
COMMENT ON COLUMN "buildings"."invoice_template_id" IS '发票模板 ID（绑定单据模板库）';
COMMENT ON COLUMN "buildings"."receipt_template_id" IS '收据模板 ID（绑定单据模板库）';

-- 2) 从旧「大厦默认模板」迁移绑定
UPDATE "buildings" b
SET "agreement_template_id" = t."id"
FROM "document_templates" t
WHERE t."building_id" = b."id"
  AND t."type" = 'agreement'
  AND t."is_building_default" = TRUE
  AND b."agreement_template_id" IS NULL;

UPDATE "buildings" b
SET "invoice_template_id" = t."id"
FROM "document_templates" t
WHERE t."building_id" = b."id"
  AND t."type" = 'invoice'
  AND t."is_building_default" = TRUE
  AND b."invoice_template_id" IS NULL;

UPDATE "buildings" b
SET "receipt_template_id" = t."id"
FROM "document_templates" t
WHERE t."building_id" = b."id"
  AND t."type" = 'receipt'
  AND t."is_building_default" = TRUE
  AND b."receipt_template_id" IS NULL;

-- 3) 兼容：旧路径字符串若等于某模板 storage_key，则补绑定
UPDATE "buildings" b
SET "agreement_template_id" = t."id"
FROM "document_templates" t
WHERE b."agreement_template_id" IS NULL
  AND b."agreement_template" IS NOT NULL
  AND b."agreement_template" <> ''
  AND t."type" = 'agreement'
  AND t."storage_key" = b."agreement_template";

UPDATE "buildings" b
SET "invoice_template_id" = t."id"
FROM "document_templates" t
WHERE b."invoice_template_id" IS NULL
  AND b."invoice_template" IS NOT NULL
  AND b."invoice_template" <> ''
  AND t."type" = 'invoice'
  AND t."storage_key" = b."invoice_template";

UPDATE "buildings" b
SET "receipt_template_id" = t."id"
FROM "document_templates" t
WHERE b."receipt_template_id" IS NULL
  AND b."receipt_template" IS NOT NULL
  AND b."receipt_template" <> ''
  AND t."type" = 'receipt'
  AND t."storage_key" = b."receipt_template";

-- 4) 删除大厦旧路径列
ALTER TABLE "buildings" DROP COLUMN IF EXISTS "agreement_template";
ALTER TABLE "buildings" DROP COLUMN IF EXISTS "invoice_template";
ALTER TABLE "buildings" DROP COLUMN IF EXISTS "receipt_template";

-- 5) 单据模板去除所属大厦 / 大厦默认
DROP INDEX IF EXISTS "document_templates_building_id_type_idx";
ALTER TABLE "document_templates" DROP CONSTRAINT IF EXISTS "document_templates_building_id_fkey";
ALTER TABLE "document_templates" DROP COLUMN IF EXISTS "building_id";
ALTER TABLE "document_templates" DROP COLUMN IF EXISTS "is_building_default";

-- 6) 大厦 FK + 索引
CREATE INDEX IF NOT EXISTS "buildings_agreement_template_id_idx" ON "buildings"("agreement_template_id");
CREATE INDEX IF NOT EXISTS "buildings_invoice_template_id_idx" ON "buildings"("invoice_template_id");
CREATE INDEX IF NOT EXISTS "buildings_receipt_template_id_idx" ON "buildings"("receipt_template_id");

ALTER TABLE "buildings"
  ADD CONSTRAINT "buildings_agreement_template_id_fkey"
  FOREIGN KEY ("agreement_template_id") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "buildings"
  ADD CONSTRAINT "buildings_invoice_template_id_fkey"
  FOREIGN KEY ("invoice_template_id") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "buildings"
  ADD CONSTRAINT "buildings_receipt_template_id_fkey"
  FOREIGN KEY ("receipt_template_id") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
