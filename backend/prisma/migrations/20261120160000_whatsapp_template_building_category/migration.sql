-- WhatsApp 模板分类 + 模板绑定大厦；移除大厦单模板 FK

CREATE TABLE "whatsapp_template_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "remark" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_template_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_template_categories_code_key" ON "whatsapp_template_categories"("code");
CREATE UNIQUE INDEX "whatsapp_template_categories_label_key" ON "whatsapp_template_categories"("label");
CREATE INDEX "whatsapp_template_categories_active_sort_order_idx" ON "whatsapp_template_categories"("active", "sort_order");
CREATE INDEX "whatsapp_template_categories_created_by_idx" ON "whatsapp_template_categories"("created_by");
CREATE INDEX "whatsapp_template_categories_updated_by_idx" ON "whatsapp_template_categories"("updated_by");

ALTER TABLE "whatsapp_template_categories"
  ADD CONSTRAINT "whatsapp_template_categories_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "whatsapp_template_categories"
  ADD CONSTRAINT "whatsapp_template_categories_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "whatsapp_template_categories" IS 'WhatsApp 发送模板分类（系统设置维护；模板按分类绑定大厦）';
COMMENT ON COLUMN "whatsapp_template_categories"."id" IS '主键';
COMMENT ON COLUMN "whatsapp_template_categories"."code" IS '稳定编码（发信／排程用，业务唯一）';
COMMENT ON COLUMN "whatsapp_template_categories"."label" IS '显示名（业务唯一）';
COMMENT ON COLUMN "whatsapp_template_categories"."remark" IS '说明／备注';
COMMENT ON COLUMN "whatsapp_template_categories"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "whatsapp_template_categories"."active" IS '是否启用（停用后新选不下拉展示；已绑定可保留）';
COMMENT ON COLUMN "whatsapp_template_categories"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "whatsapp_template_categories"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "whatsapp_template_categories"."created_at" IS '创建时间';
COMMENT ON COLUMN "whatsapp_template_categories"."updated_at" IS '更新时间';

-- 预置三类（可在系统设置增删）
INSERT INTO "whatsapp_template_categories" ("id", "code", "label", "remark", "sort_order", "active", "created_at", "updated_at")
VALUES
  ('wa_cat_monthly_invoice', 'monthly_invoice', '月度账单发送', '每月租金／账单发送', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('wa_cat_payment_reminder', 'payment_reminder', '缴费提醒', '缴费截止前提醒', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('wa_cat_overdue_handling_fee', 'overdue_handling_fee', '逾期手续费提醒', '超时未缴费逾期 n 天加收手续费提醒', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 模板先加可空列，回填后再设 NOT NULL
ALTER TABLE "whatsapp_templates" ADD COLUMN "building_id" TEXT;
ALTER TABLE "whatsapp_templates" ADD COLUMN "category_id" TEXT;

-- 旧「大厦 → 单模板」：迁为模板绑定该大厦，分类先落月度账单
UPDATE "whatsapp_templates" t
SET
  "building_id" = b."id",
  "category_id" = 'wa_cat_monthly_invoice'
FROM "buildings" b
WHERE b."whatsapp_template_id" = t."id"
  AND t."building_id" IS NULL;

-- 其余未绑定模板：若仅有一座大厦则挂上去，否则删除（避免 NOT NULL 失败）
UPDATE "whatsapp_templates" t
SET
  "building_id" = (SELECT "id" FROM "buildings" ORDER BY "created_at" ASC LIMIT 1),
  "category_id" = COALESCE(t."category_id", 'wa_cat_monthly_invoice')
WHERE t."building_id" IS NULL
  AND (SELECT COUNT(*) FROM "buildings") = 1;

DELETE FROM "whatsapp_templates" WHERE "building_id" IS NULL OR "category_id" IS NULL;

-- 同一大厦多条落入同分类时，仅保留 sort_order 最小的一条，其余改挂缴费提醒／逾期（尽量保住数据）
WITH ranked AS (
  SELECT
    t."id",
    t."building_id",
    ROW_NUMBER() OVER (PARTITION BY t."building_id", t."category_id" ORDER BY t."sort_order" ASC, t."created_at" ASC) AS rn
  FROM "whatsapp_templates" t
)
UPDATE "whatsapp_templates" t
SET "category_id" = CASE
  WHEN ranked.rn = 2 THEN 'wa_cat_payment_reminder'
  WHEN ranked.rn = 3 THEN 'wa_cat_overdue_handling_fee'
  ELSE t."category_id"
END
FROM ranked
WHERE t."id" = ranked."id" AND ranked.rn > 1;

-- 仍冲突则删多余
WITH ranked AS (
  SELECT
    t."id",
    ROW_NUMBER() OVER (PARTITION BY t."building_id", t."category_id" ORDER BY t."sort_order" ASC, t."created_at" ASC) AS rn
  FROM "whatsapp_templates" t
)
DELETE FROM "whatsapp_templates" t
USING ranked
WHERE t."id" = ranked."id" AND ranked.rn > 1;

ALTER TABLE "whatsapp_templates" ALTER COLUMN "building_id" SET NOT NULL;
ALTER TABLE "whatsapp_templates" ALTER COLUMN "category_id" SET NOT NULL;

COMMENT ON COLUMN "whatsapp_templates"."building_id" IS '所属大厦 ID';
COMMENT ON COLUMN "whatsapp_templates"."category_id" IS '模板分类 ID';
COMMENT ON TABLE "whatsapp_templates" IS 'WhatsApp 发送模板（系统设置维护；每条绑定一座大厦 + 一个分类；Meta 按钮写死故不可跨楼复用）';

CREATE UNIQUE INDEX "whatsapp_templates_building_id_category_id_key" ON "whatsapp_templates"("building_id", "category_id");
CREATE INDEX "whatsapp_templates_building_id_idx" ON "whatsapp_templates"("building_id");
CREATE INDEX "whatsapp_templates_category_id_idx" ON "whatsapp_templates"("category_id");

ALTER TABLE "whatsapp_templates"
  ADD CONSTRAINT "whatsapp_templates_building_id_fkey"
  FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "whatsapp_templates"
  ADD CONSTRAINT "whatsapp_templates_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "whatsapp_template_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 移除大厦单模板 FK
ALTER TABLE "buildings" DROP CONSTRAINT IF EXISTS "buildings_whatsapp_template_id_fkey";
DROP INDEX IF EXISTS "buildings_whatsapp_template_id_idx";
ALTER TABLE "buildings" DROP COLUMN IF EXISTS "whatsapp_template_id";
