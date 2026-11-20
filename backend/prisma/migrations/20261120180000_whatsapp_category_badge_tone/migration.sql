-- 模板分类：可自定义列表胶囊色调

ALTER TABLE "whatsapp_template_categories"
  ADD COLUMN "badge_tone" TEXT NOT NULL DEFAULT 'neutral';

COMMENT ON COLUMN "whatsapp_template_categories"."badge_tone" IS '列表胶囊色调（与前端 StatusBadge tone 一致：idle/signing/contracting/leased/leasing/terminating/active/disabled/neutral）';

-- 回填已知预置分类色
UPDATE "whatsapp_template_categories" SET "badge_tone" = 'leased' WHERE "code" = 'monthly_invoice';
UPDATE "whatsapp_template_categories" SET "badge_tone" = 'signing' WHERE "code" = 'payment_reminder';
UPDATE "whatsapp_template_categories" SET "badge_tone" = 'terminating' WHERE "code" = 'overdue_handling_fee';
UPDATE "whatsapp_template_categories" SET "badge_tone" = 'leasing' WHERE "code" = 'receipt_confirm';
UPDATE "whatsapp_template_categories" SET "badge_tone" = 'disabled' WHERE "code" = 'legacy_unsorted';
