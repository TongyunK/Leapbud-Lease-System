-- 侧栏菜单「單據模板」更名为「列印模板」

UPDATE "menus"
SET
  "name" = '列印模板',
  "name_en" = 'Print templates',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "name_key" = 'menu.documentTemplates'
   OR "route_name" = 'documentTemplates';
