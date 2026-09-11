-- Menu: 合約期管理
INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES (
  'menu_contract_periods',
  'menu_contract_mgmt',
  'menu',
  '合約期',
  'menu.contractPeriods',
  'contractPeriods',
  'contract-mgmt/contract-periods',
  'Calendar',
  28,
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
SELECT r."id", 'menu_contract_periods', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."code" IN ('admin', 'user')
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
