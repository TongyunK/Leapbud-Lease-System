-- 应收帐表 + 财务菜单

CREATE TABLE "receivables" (
  "id" TEXT NOT NULL,
  "receivable_code" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "invoice_date" DATE,
  "payment_due_date" DATE,
  "invoice_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "received_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "receivable_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "remark" TEXT NOT NULL DEFAULT '',
  "related_receipt_ref" TEXT NOT NULL DEFAULT '',
  "deposit_refund_id" TEXT,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "receivables_receivable_code_key" ON "receivables"("receivable_code");
CREATE INDEX "receivables_invoice_id_idx" ON "receivables"("invoice_id");
CREATE INDEX "receivables_contract_id_idx" ON "receivables"("contract_id");
CREATE INDEX "receivables_customer_id_idx" ON "receivables"("customer_id");
CREATE INDEX "receivables_deposit_refund_id_idx" ON "receivables"("deposit_refund_id");
CREATE INDEX "receivables_invoice_date_idx" ON "receivables"("invoice_date");
CREATE INDEX "receivables_payment_due_date_idx" ON "receivables"("payment_due_date");
CREATE INDEX "receivables_created_by_idx" ON "receivables"("created_by");
CREATE INDEX "receivables_updated_by_idx" ON "receivables"("updated_by");

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_deposit_refund_id_fkey"
  FOREIGN KEY ("deposit_refund_id") REFERENCES "deposit_refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "receivables" IS '应收帐（财务：发票对应的应收与回款汇总）';
COMMENT ON COLUMN "receivables"."id" IS '主键';
COMMENT ON COLUMN "receivables"."receivable_code" IS '应收编号（业务唯一，如 AR2609160001）';
COMMENT ON COLUMN "receivables"."invoice_id" IS '所属发票 ID';
COMMENT ON COLUMN "receivables"."contract_id" IS '所属合约 ID（通常与发票合约一致）';
COMMENT ON COLUMN "receivables"."customer_id" IS '所属客户 ID（通常与发票客户一致）';
COMMENT ON COLUMN "receivables"."invoice_date" IS '发票日期';
COMMENT ON COLUMN "receivables"."payment_due_date" IS '收款期限';
COMMENT ON COLUMN "receivables"."invoice_amount" IS '开票金额';
COMMENT ON COLUMN "receivables"."received_amount" IS '已收金额';
COMMENT ON COLUMN "receivables"."receivable_amount" IS '应收金额（通常 = 开票金额 − 已收金额，可覆盖）';
COMMENT ON COLUMN "receivables"."remark" IS '备注';
COMMENT ON COLUMN "receivables"."related_receipt_ref" IS '收款记录引用（收据实体尚未建立，文本占位）';
COMMENT ON COLUMN "receivables"."deposit_refund_id" IS '关联按金退还记录 ID（可选）';
COMMENT ON COLUMN "receivables"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "receivables"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "receivables"."created_at" IS '创建时间';
COMMENT ON COLUMN "receivables"."updated_at" IS '更新时间';

INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES (
  'menu_receivables',
  'menu_finance_mgmt',
  'menu',
  '應收帳',
  'menu.receivables',
  'receivables',
  'finance-mgmt/receivables',
  'Wallet',
  40,
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

-- 系统管理目录 sort 后移，避免与应收菜单冲突
UPDATE "menus" SET "sort_order" = 45, "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'menu_system' AND "sort_order" <= 40;

INSERT INTO "role_menus" ("role_id", "menu_id", "created_at")
SELECT r."id", 'menu_receivables', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."code" IN ('admin', 'user')
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
