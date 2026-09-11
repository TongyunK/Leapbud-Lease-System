-- 财务管理目录 + 按金扣除事項菜单（数据复用 contract_other_fees）

INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES
(
  'menu_finance_mgmt',
  NULL,
  'directory',
  '财务管理',
  'menu.financeMgmt',
  '',
  '',
  'Wallet',
  35,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'menu_deposit_deductions',
  'menu_finance_mgmt',
  'menu',
  '按金扣除事項',
  'menu.depositDeductions',
  'depositDeductions',
  'finance-mgmt/deposit-deductions',
  'Coin',
  36,
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

-- 系统管理排在财务之后
UPDATE "menus" SET "sort_order" = 40, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'menu_system';
UPDATE "menus" SET "sort_order" = 41, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'menu_users';
UPDATE "menus" SET "sort_order" = 42, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'menu_roles';
UPDATE "menus" SET "sort_order" = 43, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'menu_menus';

INSERT INTO "role_menus" ("role_id", "menu_id", "created_at")
SELECT r."id", m."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN (VALUES ('menu_finance_mgmt'), ('menu_deposit_deductions')) AS m("id")
WHERE r."code" IN ('admin', 'user')
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
