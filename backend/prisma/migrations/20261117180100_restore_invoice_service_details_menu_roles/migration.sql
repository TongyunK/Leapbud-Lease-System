-- 补齐 admin / superAdmin 的「服務細節」菜单授权

INSERT INTO "role_menus" ("role_id", "menu_id", "created_at")
SELECT r."id", 'menu_invoice_service_details', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."code" IN ('admin', 'superAdmin')
  AND NOT EXISTS (
    SELECT 1
    FROM "role_menus" rm
    WHERE rm."role_id" = r."id"
      AND rm."menu_id" = 'menu_invoice_service_details'
  );
