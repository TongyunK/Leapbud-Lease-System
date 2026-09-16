-- 按金退还记录表 + 财务菜单

CREATE TABLE "deposit_refunds" (
  "id" TEXT NOT NULL,
  "refund_code" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "room_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT '',
  "termination_date" DATE,
  "refund_date" DATE,
  "total_deposit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "actual_refund_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "handler_id" TEXT,
  "voucher_image" TEXT NOT NULL DEFAULT '',
  "voucher_attachment" TEXT NOT NULL DEFAULT '',
  "remark" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "deposit_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deposit_refunds_refund_code_key" ON "deposit_refunds"("refund_code");
CREATE INDEX "deposit_refunds_contract_id_idx" ON "deposit_refunds"("contract_id");
CREATE INDEX "deposit_refunds_customer_id_idx" ON "deposit_refunds"("customer_id");
CREATE INDEX "deposit_refunds_room_id_idx" ON "deposit_refunds"("room_id");
CREATE INDEX "deposit_refunds_handler_id_idx" ON "deposit_refunds"("handler_id");
CREATE INDEX "deposit_refunds_status_idx" ON "deposit_refunds"("status");
CREATE INDEX "deposit_refunds_termination_date_idx" ON "deposit_refunds"("termination_date");
CREATE INDEX "deposit_refunds_refund_date_idx" ON "deposit_refunds"("refund_date");
CREATE INDEX "deposit_refunds_created_by_idx" ON "deposit_refunds"("created_by");
CREATE INDEX "deposit_refunds_updated_by_idx" ON "deposit_refunds"("updated_by");

ALTER TABLE "deposit_refunds"
  ADD CONSTRAINT "deposit_refunds_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deposit_refunds"
  ADD CONSTRAINT "deposit_refunds_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deposit_refunds"
  ADD CONSTRAINT "deposit_refunds_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deposit_refunds"
  ADD CONSTRAINT "deposit_refunds_handler_id_fkey"
  FOREIGN KEY ("handler_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deposit_refunds"
  ADD CONSTRAINT "deposit_refunds_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deposit_refunds"
  ADD CONSTRAINT "deposit_refunds_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "deposit_refunds" IS '按金退还记录（财务：合约退租后的按金退还办理单）';
COMMENT ON COLUMN "deposit_refunds"."id" IS '主键';
COMMENT ON COLUMN "deposit_refunds"."refund_code" IS '退还编号（业务唯一，如 DRF2609160001）';
COMMENT ON COLUMN "deposit_refunds"."contract_id" IS '所属合约 ID';
COMMENT ON COLUMN "deposit_refunds"."customer_id" IS '所属客户 ID（通常与合约客户一致）';
COMMENT ON COLUMN "deposit_refunds"."room_id" IS '所属房间 ID（通常与合约房间一致）';
COMMENT ON COLUMN "deposit_refunds"."status" IS '状态（草稿 / 未退按金 / 已退按金 / 已取消）';
COMMENT ON COLUMN "deposit_refunds"."termination_date" IS '退租日期';
COMMENT ON COLUMN "deposit_refunds"."refund_date" IS '退款日期';
COMMENT ON COLUMN "deposit_refunds"."total_deposit" IS '按金总额';
COMMENT ON COLUMN "deposit_refunds"."actual_refund_amount" IS '实退按金金额';
COMMENT ON COLUMN "deposit_refunds"."handler_id" IS '处理人用户 ID';
COMMENT ON COLUMN "deposit_refunds"."voucher_image" IS '退还凭证图片路径';
COMMENT ON COLUMN "deposit_refunds"."voucher_attachment" IS '退还凭证附件路径';
COMMENT ON COLUMN "deposit_refunds"."remark" IS '备注';
COMMENT ON COLUMN "deposit_refunds"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "deposit_refunds"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "deposit_refunds"."created_at" IS '创建时间';
COMMENT ON COLUMN "deposit_refunds"."updated_at" IS '更新时间';

INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES (
  'menu_deposit_refunds',
  'menu_finance_mgmt',
  'menu',
  '按金退還記錄',
  'menu.depositRefunds',
  'depositRefunds',
  'finance-mgmt/deposit-refunds',
  'Money',
  37,
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
SELECT r."id", 'menu_deposit_refunds', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."code" IN ('admin', 'user')
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
