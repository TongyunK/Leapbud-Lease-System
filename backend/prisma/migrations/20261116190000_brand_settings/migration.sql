-- 品牌外观：Logo / 主题色 / 系统标题 / 副标题（一键一值）

INSERT INTO "system_settings" ("id", "key", "value", "label", "remark", "sort_order", "created_at", "updated_at")
VALUES
  (
    'sysset_brand_logo',
    'brand_logo',
    '',
    '系统 Logo',
    '登录页与侧栏 Logo；存 uploads 相对键，空则用默认 /leapbud_logo.png',
    40,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'sysset_brand_theme_color',
    'brand_theme_color',
    '#0f4a32',
    '系统主题色',
    '侧栏与登录品牌区主色；影响 --lb-brand / Element Plus 主色',
    41,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'sysset_brand_title',
    'brand_title',
    'leapbud',
    '系统标题',
    '登录页小字（kicker）与侧栏主名',
    42,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'sysset_brand_subtitle',
    'brand_subtitle',
    '租賃管理系統',
    '系统副标题',
    '登录页大标题与侧栏副标',
    43,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "remark" = EXCLUDED."remark",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = CURRENT_TIMESTAMP;

COMMENT ON TABLE "system_settings" IS '系统设置（一键一值）';
COMMENT ON COLUMN "system_settings"."key" IS '设置键（唯一）';
COMMENT ON COLUMN "system_settings"."value" IS '设置值（文本；JSON／密文等由业务解释）';
