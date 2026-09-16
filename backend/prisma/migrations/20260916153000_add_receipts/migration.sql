-- 收据表 + 财务菜单

CREATE TABLE "receipts" (
  "id" TEXT NOT NULL,
  "receipt_code" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "contract_id" TEXT,
  "invoice_id" TEXT,
  "receivable_id" TEXT,
  "payment_date" DATE,
  "payment_method" TEXT NOT NULL DEFAULT '',
  "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "remark" TEXT NOT NULL DEFAULT '',
  "voucher_1" TEXT NOT NULL DEFAULT '',
  "voucher_2" TEXT NOT NULL DEFAULT '',
  "change_log" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "receipts_receipt_code_key" ON "receipts"("receipt_code");
CREATE INDEX "receipts_customer_id_idx" ON "receipts"("customer_id");
CREATE INDEX "receipts_contract_id_idx" ON "receipts"("contract_id");
CREATE INDEX "receipts_invoice_id_idx" ON "receipts"("invoice_id");
CREATE INDEX "receipts_receivable_id_idx" ON "receipts"("receivable_id");
CREATE INDEX "receipts_payment_date_idx" ON "receipts"("payment_date");
CREATE INDEX "receipts_payment_method_idx" ON "receipts"("payment_method");
CREATE INDEX "receipts_created_by_idx" ON "receipts"("created_by");
CREATE INDEX "receipts_updated_by_idx" ON "receipts"("updated_by");

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_receivable_id_fkey"
  FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "receipts" IS '收据（财务：收款凭证记录）';
COMMENT ON COLUMN "receipts"."id" IS '主键';
COMMENT ON COLUMN "receipts"."receipt_code" IS '收据编号（业务唯一，如 RCP2609160001）';
COMMENT ON COLUMN "receipts"."customer_id" IS '所属客户 ID';
COMMENT ON COLUMN "receipts"."contract_id" IS '所属合约 ID（可选）';
COMMENT ON COLUMN "receipts"."invoice_id" IS '所属发票 ID（可选）';
COMMENT ON COLUMN "receipts"."receivable_id" IS '所属应收帐 ID（可选）';
COMMENT ON COLUMN "receipts"."payment_date" IS '收款日期';
COMMENT ON COLUMN "receipts"."payment_method" IS '收款方式（银行转账 / 支票 / 现金 / FPS 等）';
COMMENT ON COLUMN "receipts"."amount" IS '收款金额';
COMMENT ON COLUMN "receipts"."remark" IS '备注';
COMMENT ON COLUMN "receipts"."voucher_1" IS '收款凭证1路径';
COMMENT ON COLUMN "receipts"."voucher_2" IS '收款凭证2路径';
COMMENT ON COLUMN "receipts"."change_log" IS '修改记录（文本审计摘要）';
COMMENT ON COLUMN "receipts"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "receipts"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "receipts"."created_at" IS '创建时间';
COMMENT ON COLUMN "receipts"."updated_at" IS '更新时间';

INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES (
  'menu_receipts',
  'menu_finance_mgmt',
  'menu',
  '收據',
  'menu.receipts',
  'receipts',
  'finance-mgmt/receipts',
  'Ticket',
  41,
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
SELECT r."id", 'menu_receipts', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."code" IN ('admin', 'user')
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
