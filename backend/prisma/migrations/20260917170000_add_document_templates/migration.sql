-- 单据打印模板表 + 客户协议模板覆盖 + 系统菜单

CREATE TYPE "DocumentTemplateType" AS ENUM ('agreement', 'invoice', 'receipt');
COMMENT ON TYPE "DocumentTemplateType" IS '单据打印模板类型：agreement=协议 / invoice=发票 / receipt=收据';

CREATE TABLE "document_templates" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "DocumentTemplateType" NOT NULL,
  "file_name" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "building_id" TEXT,
  "is_building_default" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "remark" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_templates_type_enabled_idx" ON "document_templates"("type", "enabled");
CREATE INDEX "document_templates_building_id_type_idx" ON "document_templates"("building_id", "type");
CREATE INDEX "document_templates_created_by_idx" ON "document_templates"("created_by");
CREATE INDEX "document_templates_updated_by_idx" ON "document_templates"("updated_by");

ALTER TABLE "document_templates"
  ADD CONSTRAINT "document_templates_building_id_fkey"
  FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_templates"
  ADD CONSTRAINT "document_templates_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_templates"
  ADD CONSTRAINT "document_templates_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "document_templates" IS '单据打印模板（Word .docx；按 type 区分协议/发票/收据等）';
COMMENT ON COLUMN "document_templates"."id" IS '主键';
COMMENT ON COLUMN "document_templates"."name" IS '模板名称（展示用）';
COMMENT ON COLUMN "document_templates"."type" IS '单据类型：agreement / invoice / receipt';
COMMENT ON COLUMN "document_templates"."file_name" IS '原始文件名';
COMMENT ON COLUMN "document_templates"."storage_key" IS '存储相对路径（相对 uploads 根目录）';
COMMENT ON COLUMN "document_templates"."building_id" IS '所属大厦 ID（非空且 is_building_default=true 时作为该大厦该 type 默认模板）';
COMMENT ON COLUMN "document_templates"."is_building_default" IS '是否作为所属大厦该 type 的默认模板';
COMMENT ON COLUMN "document_templates"."enabled" IS '是否启用';
COMMENT ON COLUMN "document_templates"."remark" IS '备注';
COMMENT ON COLUMN "document_templates"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "document_templates"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "document_templates"."created_at" IS '创建时间';
COMMENT ON COLUMN "document_templates"."updated_at" IS '更新时间';

ALTER TABLE "customers" ADD COLUMN "agreement_template_id" TEXT;
CREATE INDEX "customers_agreement_template_id_idx" ON "customers"("agreement_template_id");
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_agreement_template_id_fkey"
  FOREIGN KEY ("agreement_template_id") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMENT ON COLUMN "customers"."agreement_template_id" IS '协议打印模板覆盖 ID（空则用所属大厦该 type 默认模板）';

INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES (
  'menu_document_templates',
  'menu_system',
  'menu',
  '单据模板',
  'menu.documentTemplates',
  'documentTemplates',
  'system/document-templates',
  'Document',
  95,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
  "name" = EXCLUDED."name",
  "name_key" = EXCLUDED."name_key",
  "route_name" = EXCLUDED."route_name",
  "path" = EXCLUDED."path",
  "icon" = EXCLUDED."icon",
  "sort_order" = EXCLUDED."sort_order",
  "active" = EXCLUDED."active",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "role_menus" ("role_id", "menu_id", "created_at")
SELECT r."id", 'menu_document_templates', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."code" IN ('admin')
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
