-- 服务细节：补充 LATE / 审计字段 + 独立菜单

ALTER TABLE "invoice_service_details"
  ADD COLUMN IF NOT EXISTS "late" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "created_by" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_by" TEXT;

CREATE INDEX IF NOT EXISTS "invoice_service_details_created_by_idx" ON "invoice_service_details"("created_by");
CREATE INDEX IF NOT EXISTS "invoice_service_details_updated_by_idx" ON "invoice_service_details"("updated_by");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_service_details_created_by_fkey'
  ) THEN
    ALTER TABLE "invoice_service_details"
      ADD CONSTRAINT "invoice_service_details_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_service_details_updated_by_fkey'
  ) THEN
    ALTER TABLE "invoice_service_details"
      ADD CONSTRAINT "invoice_service_details_updated_by_fkey"
      FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE "invoice_service_details" IS '发票服务细节行（开票明细）';
COMMENT ON COLUMN "invoice_service_details"."id" IS '主键';
COMMENT ON COLUMN "invoice_service_details"."invoice_id" IS '所属发票 ID';
COMMENT ON COLUMN "invoice_service_details"."description" IS '服务描述';
COMMENT ON COLUMN "invoice_service_details"."quantity" IS '数量';
COMMENT ON COLUMN "invoice_service_details"."unit_amount" IS '单价';
COMMENT ON COLUMN "invoice_service_details"."subtotal" IS '小计（通常 = 数量 × 单价）';
COMMENT ON COLUMN "invoice_service_details"."remark" IS '备注';
COMMENT ON COLUMN "invoice_service_details"."late" IS 'LATE（旧系统文本字段）';
COMMENT ON COLUMN "invoice_service_details"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "invoice_service_details"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "invoice_service_details"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "invoice_service_details"."created_at" IS '创建时间';
COMMENT ON COLUMN "invoice_service_details"."updated_at" IS '更新时间';

INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES (
  'menu_invoice_service_details',
  'menu_finance_mgmt',
  'menu',
  '服務細節',
  'menu.invoiceServiceDetails',
  'invoiceServiceDetails',
  'finance-mgmt/invoice-service-details',
  'Tickets',
  39,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
  "name" = EXCLUDED."name",
  "name_key" = EXCLUDED."name_key",
  "route_name" = EXCLUDED."route_name",
  "path" = EXCLUDED."path",
  "icon" = EXCLUDED."icon",
  "sort_order" = EXCLUDED."sort_order",
  "active" = EXCLUDED."active",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "role_menus" ("role_id", "menu_id", "created_at")
SELECT r."id", 'menu_invoice_service_details', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."code" IN ('admin', 'user')
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
