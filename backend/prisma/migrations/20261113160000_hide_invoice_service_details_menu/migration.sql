-- 侧栏隐藏「服務細節」独立菜单（业务改由发票／合约详情承接；路由与权限仍保留）

UPDATE "menus"
SET
  "active" = false,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "route_name" = 'invoiceServiceDetails'
   OR "id" = 'menu_invoice_service_details';
