-- 恢复侧栏「服務細節」独立菜单与列表页入口

UPDATE "menus"
SET
  "active" = true,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "route_name" = 'invoiceServiceDetails'
   OR "id" = 'menu_invoice_service_details';
