-- 侧栏隐藏旧「按金扣除事項／按金退還記錄」菜单（业务改由结算单／退款单承接；路由与权限仍保留）

UPDATE "menus"
SET
  "active" = false,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "route_name" IN ('depositDeductions', 'depositRefunds')
   OR "id" IN ('menu_deposit_deductions', 'menu_deposit_refunds');
