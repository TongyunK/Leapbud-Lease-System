-- 移除菜单「可见」字段（侧栏仅按启用 + 角色权限控制）
ALTER TABLE "menus" DROP COLUMN IF EXISTS "visible";
