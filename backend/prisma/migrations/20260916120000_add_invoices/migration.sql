-- 发票 + 服务细节行 + 财务菜单

CREATE TABLE "invoices" (
  "id" TEXT NOT NULL,
  "invoice_code" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "room_id" TEXT NOT NULL,
  "invoice_type" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT '待開票',
  "invoice_date" DATE,
  "payment_due_date" DATE,
  "sales_manager_id" TEXT,
  "related_receivable_ref" TEXT NOT NULL DEFAULT '',
  "attachment" TEXT NOT NULL DEFAULT '',
  "room_name_text" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "whatsapp_number" TEXT NOT NULL DEFAULT '',
  "short_term_rental_code" TEXT NOT NULL DEFAULT '',
  "remark" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_invoice_code_key" ON "invoices"("invoice_code");
CREATE INDEX "invoices_contract_id_idx" ON "invoices"("contract_id");
CREATE INDEX "invoices_customer_id_idx" ON "invoices"("customer_id");
CREATE INDEX "invoices_room_id_idx" ON "invoices"("room_id");
CREATE INDEX "invoices_sales_manager_id_idx" ON "invoices"("sales_manager_id");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");
CREATE INDEX "invoices_invoice_type_idx" ON "invoices"("invoice_type");
CREATE INDEX "invoices_invoice_date_idx" ON "invoices"("invoice_date");
CREATE INDEX "invoices_payment_due_date_idx" ON "invoices"("payment_due_date");
CREATE INDEX "invoices_created_by_idx" ON "invoices"("created_by");
CREATE INDEX "invoices_updated_by_idx" ON "invoices"("updated_by");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_sales_manager_id_fkey"
  FOREIGN KEY ("sales_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "invoice_service_details" (
  "id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "unit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "remark" TEXT NOT NULL DEFAULT '',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "invoice_service_details_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_service_details_invoice_id_idx" ON "invoice_service_details"("invoice_id");

ALTER TABLE "invoice_service_details"
  ADD CONSTRAINT "invoice_service_details_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON TABLE "invoices" IS '发票（财务：合约开票记录）';
COMMENT ON COLUMN "invoices"."id" IS '主键';
COMMENT ON COLUMN "invoices"."invoice_code" IS '发票编号（业务唯一，如 INV2609160001）';
COMMENT ON COLUMN "invoices"."contract_id" IS '所属合约 ID';
COMMENT ON COLUMN "invoices"."customer_id" IS '所属客户 ID（通常与合约客户一致）';
COMMENT ON COLUMN "invoices"."room_id" IS '所属房间 ID（通常与合约房间一致）';
COMMENT ON COLUMN "invoices"."invoice_type" IS '发票类型（會議室短租 / Deposit / 1, Charging Period / 10, Other charges）';
COMMENT ON COLUMN "invoices"."description" IS '发票描述';
COMMENT ON COLUMN "invoices"."amount" IS '开票金额';
COMMENT ON COLUMN "invoices"."status" IS '状态（待开票 / 已开票 / 已取消）';
COMMENT ON COLUMN "invoices"."invoice_date" IS '发票日期';
COMMENT ON COLUMN "invoices"."payment_due_date" IS '收款期限';
COMMENT ON COLUMN "invoices"."sales_manager_id" IS '销售经理用户 ID（通常与合约销售经理一致）';
COMMENT ON COLUMN "invoices"."related_receivable_ref" IS '应收帐引用（文本占位，待应收模块接入）';
COMMENT ON COLUMN "invoices"."attachment" IS '开票附件路径';
COMMENT ON COLUMN "invoices"."room_name_text" IS '房间名称文本快照';
COMMENT ON COLUMN "invoices"."notes" IS '备注（业务说明）';
COMMENT ON COLUMN "invoices"."whatsapp_number" IS 'WhatsApp 号码';
COMMENT ON COLUMN "invoices"."short_term_rental_code" IS '短租编号（文本；会议室短租实体尚未建立）';
COMMENT ON COLUMN "invoices"."remark" IS '备注';
COMMENT ON COLUMN "invoices"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "invoices"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "invoices"."created_at" IS '创建时间';
COMMENT ON COLUMN "invoices"."updated_at" IS '更新时间';

COMMENT ON TABLE "invoice_service_details" IS '发票服务细节行（开票明细）';
COMMENT ON COLUMN "invoice_service_details"."id" IS '主键';
COMMENT ON COLUMN "invoice_service_details"."invoice_id" IS '所属发票 ID';
COMMENT ON COLUMN "invoice_service_details"."description" IS '描述';
COMMENT ON COLUMN "invoice_service_details"."quantity" IS '数量';
COMMENT ON COLUMN "invoice_service_details"."unit_amount" IS '单价';
COMMENT ON COLUMN "invoice_service_details"."subtotal" IS '小计（通常 = 数量 × 单价）';
COMMENT ON COLUMN "invoice_service_details"."remark" IS '备注';
COMMENT ON COLUMN "invoice_service_details"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "invoice_service_details"."created_at" IS '创建时间';
COMMENT ON COLUMN "invoice_service_details"."updated_at" IS '更新时间';

INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES (
  'menu_invoices',
  'menu_finance_mgmt',
  'menu',
  '發票',
  'menu.invoices',
  'invoices',
  'finance-mgmt/invoices',
  'Document',
  38,
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
SELECT r."id", 'menu_invoices', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."code" IN ('admin', 'user')
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
