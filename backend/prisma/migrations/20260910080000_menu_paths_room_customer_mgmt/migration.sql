-- 同步菜单 path 到业务模块前缀（与前端路由一致）
UPDATE "menus" SET "path" = 'room-mgmt/room-configs', "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'menu_room_configs' OR ("route_name" = 'roomConfigs' AND "path" LIKE 'system/%');

UPDATE "menus" SET "path" = 'room-mgmt/room-types', "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'menu_room_types' OR ("route_name" = 'roomTypes' AND "path" LIKE 'system/%');

UPDATE "menus" SET "path" = 'customer-mgmt/customer-sources', "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'menu_customer_sources' OR ("route_name" = 'customerSources' AND "path" LIKE 'system/%');
