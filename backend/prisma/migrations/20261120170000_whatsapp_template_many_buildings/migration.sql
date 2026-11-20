-- WhatsApp 模板 ↔ 大厦改为多对多（一模板可关联多座大厦）

CREATE TABLE "whatsapp_template_buildings" (
    "template_id" TEXT NOT NULL,
    "building_id" TEXT NOT NULL,

    CONSTRAINT "whatsapp_template_buildings_pkey" PRIMARY KEY ("template_id", "building_id")
);

CREATE INDEX "whatsapp_template_buildings_building_id_idx" ON "whatsapp_template_buildings"("building_id");

ALTER TABLE "whatsapp_template_buildings"
  ADD CONSTRAINT "whatsapp_template_buildings_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "whatsapp_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_template_buildings"
  ADD CONSTRAINT "whatsapp_template_buildings_building_id_fkey"
  FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "whatsapp_template_buildings" IS 'WhatsApp 发送模板 ↔ 大厦（多对多）';
COMMENT ON COLUMN "whatsapp_template_buildings"."template_id" IS '模板 ID';
COMMENT ON COLUMN "whatsapp_template_buildings"."building_id" IS '大厦 ID';

-- 旧单大厦列迁入关联表
INSERT INTO "whatsapp_template_buildings" ("template_id", "building_id")
SELECT "id", "building_id"
FROM "whatsapp_templates"
WHERE "building_id" IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE "whatsapp_templates" DROP CONSTRAINT IF EXISTS "whatsapp_templates_building_id_fkey";
DROP INDEX IF EXISTS "whatsapp_templates_building_id_category_id_key";
DROP INDEX IF EXISTS "whatsapp_templates_building_id_idx";
ALTER TABLE "whatsapp_templates" DROP COLUMN IF EXISTS "building_id";

COMMENT ON TABLE "whatsapp_templates" IS 'WhatsApp 发送模板（按分类；可关联多座大厦）';
COMMENT ON COLUMN "whatsapp_templates"."category_id" IS '模板分类 ID';
