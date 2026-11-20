-- WhatsApp 商业号码目录
CREATE TABLE "whatsapp_business_numbers" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_business_numbers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_business_numbers_label_key" ON "whatsapp_business_numbers"("label");
CREATE UNIQUE INDEX "whatsapp_business_numbers_phone_number_key" ON "whatsapp_business_numbers"("phone_number");
CREATE INDEX "whatsapp_business_numbers_active_sort_order_idx" ON "whatsapp_business_numbers"("active", "sort_order");
CREATE INDEX "whatsapp_business_numbers_created_by_idx" ON "whatsapp_business_numbers"("created_by");
CREATE INDEX "whatsapp_business_numbers_updated_by_idx" ON "whatsapp_business_numbers"("updated_by");

ALTER TABLE "whatsapp_business_numbers"
  ADD CONSTRAINT "whatsapp_business_numbers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "whatsapp_business_numbers"
  ADD CONSTRAINT "whatsapp_business_numbers_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "whatsapp_business_numbers" IS 'WhatsApp 商业发送号码（系统设置维护；大厦下拉选用）';
COMMENT ON COLUMN "whatsapp_business_numbers"."id" IS '主键';
COMMENT ON COLUMN "whatsapp_business_numbers"."label" IS '显示名（业务唯一）';
COMMENT ON COLUMN "whatsapp_business_numbers"."phone_number" IS '商业号码（含区号，业务唯一）';
COMMENT ON COLUMN "whatsapp_business_numbers"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "whatsapp_business_numbers"."active" IS '是否启用（停用后新选不下拉展示；已绑定可保留）';
COMMENT ON COLUMN "whatsapp_business_numbers"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "whatsapp_business_numbers"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "whatsapp_business_numbers"."created_at" IS '创建时间';
COMMENT ON COLUMN "whatsapp_business_numbers"."updated_at" IS '更新时间';

-- WhatsApp 发送模板目录
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_templates_label_key" ON "whatsapp_templates"("label");
CREATE UNIQUE INDEX "whatsapp_templates_template_name_key" ON "whatsapp_templates"("template_name");
CREATE INDEX "whatsapp_templates_active_sort_order_idx" ON "whatsapp_templates"("active", "sort_order");
CREATE INDEX "whatsapp_templates_created_by_idx" ON "whatsapp_templates"("created_by");
CREATE INDEX "whatsapp_templates_updated_by_idx" ON "whatsapp_templates"("updated_by");

ALTER TABLE "whatsapp_templates"
  ADD CONSTRAINT "whatsapp_templates_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "whatsapp_templates"
  ADD CONSTRAINT "whatsapp_templates_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "whatsapp_templates" IS 'WhatsApp 发送模板名称（系统设置维护；大厦下拉选用）';
COMMENT ON COLUMN "whatsapp_templates"."id" IS '主键';
COMMENT ON COLUMN "whatsapp_templates"."label" IS '显示名（业务唯一）';
COMMENT ON COLUMN "whatsapp_templates"."template_name" IS '发送用模板名称（业务唯一，如 Meta template name）';
COMMENT ON COLUMN "whatsapp_templates"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "whatsapp_templates"."active" IS '是否启用（停用后新选不下拉展示；已绑定可保留）';
COMMENT ON COLUMN "whatsapp_templates"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "whatsapp_templates"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "whatsapp_templates"."created_at" IS '创建时间';
COMMENT ON COLUMN "whatsapp_templates"."updated_at" IS '更新时间';

-- 从大厦旧自由文本去重写入号码目录
INSERT INTO "whatsapp_business_numbers" ("id", "label", "phone_number", "sort_order", "active", "created_at", "updated_at")
SELECT
  'wbn_mig_' || md5(x.phone),
  x.phone,
  x.phone,
  ROW_NUMBER() OVER (ORDER BY x.first_seen, x.phone)::int,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT TRIM(b."use_wba_number") AS phone, MIN(b."created_at") AS first_seen
  FROM "buildings" b
  WHERE b."use_wba_number" IS NOT NULL AND TRIM(b."use_wba_number") <> ''
  GROUP BY TRIM(b."use_wba_number")
) x;

-- 从大厦旧自由文本去重写入模板目录
INSERT INTO "whatsapp_templates" ("id", "label", "template_name", "sort_order", "active", "created_at", "updated_at")
SELECT
  'wt_mig_' || md5(x.name),
  x.name,
  x.name,
  ROW_NUMBER() OVER (ORDER BY x.first_seen, x.name)::int,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT TRIM(b."api_template_suffix") AS name, MIN(b."created_at") AS first_seen
  FROM "buildings" b
  WHERE b."api_template_suffix" IS NOT NULL AND TRIM(b."api_template_suffix") <> ''
  GROUP BY TRIM(b."api_template_suffix")
) x;

-- 大厦新增绑定列与自动发送开关
ALTER TABLE "buildings" ADD COLUMN "whatsapp_business_number_id" TEXT;
ALTER TABLE "buildings" ADD COLUMN "whatsapp_template_id" TEXT;
ALTER TABLE "buildings" ADD COLUMN "whatsapp_auto_send_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "buildings" b
SET "whatsapp_business_number_id" = n."id"
FROM "whatsapp_business_numbers" n
WHERE b."use_wba_number" IS NOT NULL
  AND TRIM(b."use_wba_number") <> ''
  AND n."phone_number" = TRIM(b."use_wba_number");

UPDATE "buildings" b
SET "whatsapp_template_id" = t."id"
FROM "whatsapp_templates" t
WHERE b."api_template_suffix" IS NOT NULL
  AND TRIM(b."api_template_suffix") <> ''
  AND t."template_name" = TRIM(b."api_template_suffix");

CREATE INDEX "buildings_whatsapp_business_number_id_idx" ON "buildings"("whatsapp_business_number_id");
CREATE INDEX "buildings_whatsapp_template_id_idx" ON "buildings"("whatsapp_template_id");

ALTER TABLE "buildings"
  ADD CONSTRAINT "buildings_whatsapp_business_number_id_fkey"
  FOREIGN KEY ("whatsapp_business_number_id") REFERENCES "whatsapp_business_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "buildings"
  ADD CONSTRAINT "buildings_whatsapp_template_id_fkey"
  FOREIGN KEY ("whatsapp_template_id") REFERENCES "whatsapp_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON COLUMN "buildings"."whatsapp_business_number_id" IS 'WhatsApp 商业号码 ID（绑定系统设置号码目录）';
COMMENT ON COLUMN "buildings"."whatsapp_template_id" IS 'WhatsApp 发送模板 ID（绑定系统设置模板目录）';
COMMENT ON COLUMN "buildings"."whatsapp_auto_send_enabled" IS '是否开启自动发送 WhatsApp';

-- 删除旧自由文本列
ALTER TABLE "buildings" DROP COLUMN "use_wba_number";
ALTER TABLE "buildings" DROP COLUMN "api_template_suffix";
