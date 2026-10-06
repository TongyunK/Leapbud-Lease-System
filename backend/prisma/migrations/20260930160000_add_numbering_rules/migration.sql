-- 自动编号规则表 + 系统菜单

CREATE TYPE "NumberingBizKey" AS ENUM (
  'customer',
  'customerRequirement',
  'contract',
  'invoice',
  'receipt'
);
COMMENT ON TYPE "NumberingBizKey" IS '自动编号业务键：customer=客户 / customerRequirement=客户需求 / contract=合约 / invoice=发票 / receipt=收据';

CREATE TYPE "NumberingResetCycle" AS ENUM ('none', 'daily', 'monthly', 'yearly');
COMMENT ON TYPE "NumberingResetCycle" IS '自动编号序号重置周期：none=不重置 / daily=按日 / monthly=按月 / yearly=按年';

CREATE TABLE "numbering_rules" (
  "id" TEXT NOT NULL,
  "biz_key" "NumberingBizKey",
  "name" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "start_value" INTEGER NOT NULL DEFAULT 1,
  "reset_cycle" "NumberingResetCycle" NOT NULL DEFAULT 'none',
  "current_seq" INTEGER NOT NULL DEFAULT 0,
  "period_key" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "numbering_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "numbering_rules_biz_key_key" ON "numbering_rules"("biz_key");
CREATE INDEX "numbering_rules_active_sort_order_idx" ON "numbering_rules"("active", "sort_order");
CREATE INDEX "numbering_rules_created_by_idx" ON "numbering_rules"("created_by");
CREATE INDEX "numbering_rules_updated_by_idx" ON "numbering_rules"("updated_by");

ALTER TABLE "numbering_rules"
  ADD CONSTRAINT "numbering_rules_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "numbering_rules"
  ADD CONSTRAINT "numbering_rules_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "numbering_rules" IS '自动编号规则（系统设置：客户/需求/合约/发票/收据等）';
COMMENT ON COLUMN "numbering_rules"."id" IS '主键';
COMMENT ON COLUMN "numbering_rules"."biz_key" IS '业务键（与生成器绑定，唯一；复制出的备份规则可为空）';
COMMENT ON COLUMN "numbering_rules"."name" IS '规则名称';
COMMENT ON COLUMN "numbering_rules"."format" IS '编号格式（%YYYY/%YY/%MM/%DD/%HH/%mm/%ss 与 %04d 序号）';
COMMENT ON COLUMN "numbering_rules"."start_value" IS '序号起始值';
COMMENT ON COLUMN "numbering_rules"."reset_cycle" IS '重置周期';
COMMENT ON COLUMN "numbering_rules"."current_seq" IS '当前已用序号（下次取 currentSeq+1；周期重置后为 startValue-1）';
COMMENT ON COLUMN "numbering_rules"."period_key" IS '当前周期键（判断是否按周期重置，如 20260930 / 202609 / 2026）';
COMMENT ON COLUMN "numbering_rules"."active" IS '是否启用';
COMMENT ON COLUMN "numbering_rules"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "numbering_rules"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "numbering_rules"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "numbering_rules"."created_at" IS '创建时间';
COMMENT ON COLUMN "numbering_rules"."updated_at" IS '更新时间';

-- 默认规则（与现有硬编码格式一致）
INSERT INTO "numbering_rules" (
  "id", "biz_key", "name", "format", "start_value", "reset_cycle",
  "current_seq", "period_key", "active", "sort_order", "created_at", "updated_at"
) VALUES
  ('nr_customer', 'customer', '客戶編號', 'CSM%YY%04d', 1, 'yearly', 0, '', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('nr_customer_requirement', 'customerRequirement', '客戶需求編號', 'REQ%YY%MM%DD%04d', 1, 'daily', 0, '', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('nr_contract', 'contract', '合約編號', 'CTR%YY%MM%DD%04d', 1, 'daily', 0, '', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('nr_invoice', 'invoice', '發票編號', 'INV%YY%MM%DD%04d', 1, 'daily', 0, '', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('nr_receipt', 'receipt', '收據編號', 'RCP%YY%MM%DD%04d', 1, 'daily', 0, '', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES (
  'menu_auto_numbering',
  'menu_system',
  'menu',
  '自動編號',
  'menu.autoNumbering',
  'autoNumbering',
  'system/auto-numbering',
  'Tickets',
  96,
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
SELECT r."id", 'menu_auto_numbering', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."code" IN ('admin')
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
