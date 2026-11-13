-- 补授结算/退款/资金流水菜单给超级管理员，并调整财务管理内排序

UPDATE "menus"
SET "sort_order" = 6, "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'menu_contract_settlements';

UPDATE "menus"
SET "sort_order" = 7, "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'menu_refund_orders';

UPDATE "menus"
SET "sort_order" = 8, "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'menu_cash_flows';

INSERT INTO "role_menus" ("role_id", "menu_id", "created_at")
SELECT r."id", m."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN (VALUES
  ('menu_contract_settlements'),
  ('menu_refund_orders'),
  ('menu_cash_flows')
) AS m("id")
WHERE r."code" = 'superAdmin'
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
