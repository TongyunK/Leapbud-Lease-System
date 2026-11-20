-- 恢复 WhatsApp 发送模板（多对多大厦关联）
-- 用法：psql -h 127.0.0.1 -U postgres -d leapbud_lease -v ON_ERROR_STOP=1 -f restore-whatsapp-templates.sql

BEGIN;

-- 分类：待整理 / 收據確認（若不存在）
INSERT INTO "whatsapp_template_categories" (
  "id", "code", "label", "remark", "sort_order", "active", "created_at", "updated_at"
)
VALUES
  ('wa_cat_legacy', 'legacy_unsorted', '待整理', '遷移／恢復後待改綁', 90, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('wa_cat_receipt', 'receipt_confirm', '收據確認', '收款確認收據', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- 矩阵：suffix × kind → 模板
WITH buildings_map(suffix, building_id, building_label) AS (
  SELECT * FROM (VALUES
    ('ceo06', (SELECT id FROM buildings WHERE name = '環薈中心' LIMIT 1), '環薈中心'),
    ('kt9', (SELECT id FROM buildings WHERE name = '嘉圖工廠大廈' LIMIT 1), '嘉圖工廠大廈'),
    ('sp', (SELECT id FROM buildings WHERE name = '紗廠工業大廈2樓' LIMIT 1), '紗廠工業大廈2樓'),
    ('sp03', (SELECT id FROM buildings WHERE name = '紗廠工業大廈3樓' LIMIT 1), '紗廠工業大廈3樓'),
    ('6sp', (SELECT id FROM buildings WHERE name = '紗廠工業大廈6期3樓' LIMIT 1), '紗廠工業大廈6期3樓'),
    ('sp12', (SELECT id FROM buildings WHERE name = '紗廠工業大廈一二期' LIMIT 1), '紗廠工業大廈一二期'),
    ('tl5', (SELECT id FROM buildings WHERE name = '時來工業大廈' LIMIT 1), '時來工業大廈')
  ) AS v(suffix, building_id, building_label)
  WHERE building_id IS NOT NULL
),
kinds(kind, category_id, prefix) AS (
  VALUES
    ('inv', 'wa_cat_monthly_invoice', 'monthly_inv_'),
    ('warning', 'wa_cat_payment_reminder', 'monthly_warning_'),
    ('handing', 'wa_cat_overdue_handling_fee', 'monthly_handing_fee_')
),
matrix AS (
  SELECT
    'wt_restore_' || md5(k.prefix || b.suffix) AS id,
    b.building_id,
    k.category_id,
    k.prefix || b.suffix AS label,
    k.prefix || b.suffix AS template_name,
    CASE
      WHEN k.prefix || b.suffix = 'monthly_inv_kt9' THEN
        'attachments/2026/11/PLACEHOLDER-monthly_inv_kt9.png'
      ELSE ''
    END AS diagram_key,
    10 AS sort_order
  FROM buildings_map b
  CROSS JOIN kinds k
)
INSERT INTO "whatsapp_templates" (
  "id", "category_id", "label", "template_name", "remark", "diagram_key",
  "sort_order", "active", "created_at", "updated_at"
)
SELECT
  m.id, m.category_id, m.label, m.template_name, '', '',
  m.sort_order, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM matrix m
WHERE NOT EXISTS (
  SELECT 1 FROM "whatsapp_templates" t WHERE t."template_name" = m.template_name
)
ON CONFLICT ("template_name") DO NOTHING;

-- 关联大厦
WITH buildings_map(suffix, building_id) AS (
  SELECT * FROM (VALUES
    ('ceo06', (SELECT id FROM buildings WHERE name = '環薈中心' LIMIT 1)),
    ('kt9', (SELECT id FROM buildings WHERE name = '嘉圖工廠大廈' LIMIT 1)),
    ('sp', (SELECT id FROM buildings WHERE name = '紗廠工業大廈2樓' LIMIT 1)),
    ('sp03', (SELECT id FROM buildings WHERE name = '紗廠工業大廈3樓' LIMIT 1)),
    ('6sp', (SELECT id FROM buildings WHERE name = '紗廠工業大廈6期3樓' LIMIT 1)),
    ('sp12', (SELECT id FROM buildings WHERE name = '紗廠工業大廈一二期' LIMIT 1)),
    ('tl5', (SELECT id FROM buildings WHERE name = '時來工業大廈' LIMIT 1))
  ) AS v(suffix, building_id)
  WHERE building_id IS NOT NULL
),
kinds(prefix) AS (
  VALUES ('monthly_inv_'), ('monthly_warning_'), ('monthly_handing_fee_')
)
INSERT INTO "whatsapp_template_buildings" ("template_id", "building_id")
SELECT t.id, b.building_id
FROM buildings_map b
CROSS JOIN kinds k
JOIN "whatsapp_templates" t ON t."template_name" = k.prefix || b.suffix
ON CONFLICT DO NOTHING;

-- 短名待整理
WITH short_rows(name, building_name) AS (
  VALUES
    ('ceo06', '環薈中心'),
    ('kt9', '嘉圖工廠大廈'),
    ('sp', '紗廠工業大廈2樓'),
    ('sp03', '紗廠工業大廈3樓'),
    ('6sp', '紗廠工業大廈6期3樓'),
    ('tl5', '時來工業大廈'),
    ('111111111111', '伟大的罗曼城')
)
INSERT INTO "whatsapp_templates" (
  "id", "category_id", "label", "template_name", "remark", "diagram_key",
  "sort_order", "active", "created_at", "updated_at"
)
SELECT
  'wt_restore_' || md5('legacy_' || s.name),
  'wa_cat_legacy',
  s.name,
  s.name,
  '待整理短名，請改綁分類／大廈',
  '',
  50,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM short_rows s
WHERE NOT EXISTS (
  SELECT 1 FROM "whatsapp_templates" t WHERE t."template_name" = s.name
)
ON CONFLICT ("template_name") DO NOTHING;

INSERT INTO "whatsapp_template_buildings" ("template_id", "building_id")
SELECT t.id, b.id
FROM "whatsapp_templates" t
JOIN buildings b ON (
  (t.template_name = 'ceo06' AND b.name = '環薈中心')
  OR (t.template_name = 'kt9' AND b.name = '嘉圖工廠大廈')
  OR (t.template_name = 'sp' AND b.name = '紗廠工業大廈2樓')
  OR (t.template_name = 'sp03' AND b.name = '紗廠工業大廈3樓')
  OR (t.template_name = '6sp' AND b.name = '紗廠工業大廈6期3樓')
  OR (t.template_name = 'tl5' AND b.name = '時來工業大廈')
  OR (t.template_name = '111111111111' AND b.name = '伟大的罗曼城')
)
WHERE t.category_id = 'wa_cat_legacy'
ON CONFLICT DO NOTHING;

-- 收据
INSERT INTO "whatsapp_templates" (
  "id", "category_id", "label", "template_name", "remark", "diagram_key",
  "sort_order", "active", "created_at", "updated_at"
)
SELECT
  'wt_restore_' || md5('receipt_to_custmor_sp12'),
  'wa_cat_receipt',
  'receipt_to_custmor_sp12',
  'receipt_to_custmor_sp12',
  '【收據】收款確認',
  '',
  20,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "whatsapp_templates" WHERE "template_name" = 'receipt_to_custmor_sp12'
)
ON CONFLICT ("template_name") DO NOTHING;

INSERT INTO "whatsapp_template_buildings" ("template_id", "building_id")
SELECT t.id, b.id
FROM "whatsapp_templates" t
JOIN buildings b ON b.name = '紗廠工業大廈一二期'
WHERE t.template_name = 'receipt_to_custmor_sp12'
ON CONFLICT DO NOTHING;

COMMIT;

SELECT c.label AS category, COUNT(*) AS cnt
FROM whatsapp_templates t
JOIN whatsapp_template_categories c ON c.id = t.category_id
GROUP BY c.label
ORDER BY cnt DESC;

SELECT COUNT(*) AS total_templates FROM whatsapp_templates;
