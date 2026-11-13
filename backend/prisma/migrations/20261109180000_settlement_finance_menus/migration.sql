-- 财务管理：合约结算 / 退款单 / 资金流水 菜单

INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES
(
  'menu_contract_settlements',
  'menu_finance_mgmt',
  'menu',
  '合約結算單',
  'menu.contractSettlements',
  'contractSettlements',
  'finance-mgmt/contract-settlements',
  'Document',
  6,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'menu_refund_orders',
  'menu_finance_mgmt',
  'menu',
  '退款單',
  'menu.refundOrders',
  'refundOrders',
  'finance-mgmt/refund-orders',
  'Wallet',
  7,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'menu_cash_flows',
  'menu_finance_mgmt',
  'menu',
  '資金流水',
  'menu.cashFlows',
  'cashFlows',
  'finance-mgmt/cash-flows',
  'Coin',
  8,
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
SELECT r."id", m."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN (VALUES
  ('menu_contract_settlements'),
  ('menu_refund_orders'),
  ('menu_cash_flows')
) AS m("id")
WHERE r."code" IN ('admin', 'user', 'superAdmin')
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
