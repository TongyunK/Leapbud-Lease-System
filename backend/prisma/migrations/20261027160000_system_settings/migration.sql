-- 系统参数表 + 默认「租金开票提前天数」+ 系统管理菜单

CREATE TABLE "system_settings" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL DEFAULT '',
  "label" TEXT NOT NULL DEFAULT '',
  "remark" TEXT NOT NULL DEFAULT '',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");
CREATE INDEX "system_settings_sort_order_idx" ON "system_settings"("sort_order");
CREATE INDEX "system_settings_created_by_idx" ON "system_settings"("created_by");
CREATE INDEX "system_settings_updated_by_idx" ON "system_settings"("updated_by");

ALTER TABLE "system_settings"
  ADD CONSTRAINT "system_settings_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "system_settings"
  ADD CONSTRAINT "system_settings_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "system_settings" IS '系统参数（键值；供业务模块读取可配置项）';
COMMENT ON COLUMN "system_settings"."id" IS '主键';
COMMENT ON COLUMN "system_settings"."key" IS '参数键（业务唯一，如 rent_invoice_lead_days）';
COMMENT ON COLUMN "system_settings"."value" IS '参数值（统一存文本；数值类自行解析）';
COMMENT ON COLUMN "system_settings"."label" IS '显示名称（中文说明）';
COMMENT ON COLUMN "system_settings"."remark" IS '备注 / 帮助说明';
COMMENT ON COLUMN "system_settings"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "system_settings"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "system_settings"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "system_settings"."created_at" IS '创建时间';
COMMENT ON COLUMN "system_settings"."updated_at" IS '更新时间';

INSERT INTO "system_settings" ("id", "key", "value", "label", "remark", "sort_order", "created_at", "updated_at")
VALUES (
  'sysset_rent_invoice_lead_days',
  'rent_invoice_lead_days',
  '7',
  '租金自動開票提前天數',
  '距下一繳費週期開始日還有多少天時，自動開立該期租金發票（含當天）。預設 7。',
  10,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_en", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
)
VALUES (
  'menu_system_settings',
  'menu_system',
  'menu',
  '系統設置',
  'System settings',
  'menu.systemSettings',
  'systemSettings',
  'system/settings',
  'SetUp',
  40,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "name_en" = EXCLUDED."name_en",
  "name_key" = EXCLUDED."name_key",
  "route_name" = EXCLUDED."route_name",
  "path" = EXCLUDED."path",
  "icon" = EXCLUDED."icon",
  "sort_order" = EXCLUDED."sort_order",
  "active" = true,
  "updated_at" = CURRENT_TIMESTAMP;

-- 管理员 / 超级管理员可见该菜单（若角色已存在）
INSERT INTO "role_menus" ("role_id", "menu_id", "created_at")
SELECT r."id", 'menu_system_settings', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."code" IN ('admin', 'superAdmin')
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
