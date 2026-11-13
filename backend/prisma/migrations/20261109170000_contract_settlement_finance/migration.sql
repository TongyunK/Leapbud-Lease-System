-- 合约结算与财务凭证：settlement / writeoff / refund / change_log / cash_flow

CREATE TYPE "ContractSettlementType" AS ENUM ('VACATE', 'CANCEL');
CREATE TYPE "ContractSettlementStatus" AS ENUM ('executed', 'pending_refund', 'settled', 'cancelled');
CREATE TYPE "ContractSettlementItemType" AS ENUM (
  'DAMAGE_DEDUCTION',
  'PENALTY_DEDUCTION',
  'WAIVER',
  'ADDITIONAL_CHARGE',
  'REFUND_ALLOCATION',
  'VOID_RECEIVABLE'
);
CREATE TYPE "ReceivableWriteoffDirection" AS ENUM ('reduce', 'reverse');
CREATE TYPE "RefundOrderStatus" AS ENUM ('pending', 'paid', 'cancelled');
CREATE TYPE "CashFlowDirection" AS ENUM ('in', 'out');
CREATE TYPE "CashFlowSourceType" AS ENUM ('receipt', 'refund_order');

CREATE TABLE "contract_settlements" (
  "id" TEXT NOT NULL,
  "settlement_code" TEXT NOT NULL,
  "type" "ContractSettlementType" NOT NULL,
  "status" "ContractSettlementStatus" NOT NULL DEFAULT 'executed',
  "contract_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "room_id" TEXT NOT NULL,
  "settlement_date" DATE NOT NULL,
  "deduction_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "waiver_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "additional_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "refund_due_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "refunded_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "collect_due_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "lease_termination_id" TEXT,
  "deposit_refund_id" TEXT,
  "remark" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contract_settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contract_settlement_items" (
  "id" TEXT NOT NULL,
  "settlement_id" TEXT NOT NULL,
  "item_type" "ContractSettlementItemType" NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "amount" DECIMAL(14,2) NOT NULL,
  "receivable_id" TEXT,
  "invoice_id" TEXT,
  "other_fee_id" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "remark" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contract_settlement_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "receivable_writeoffs" (
  "id" TEXT NOT NULL,
  "writeoff_code" TEXT NOT NULL,
  "receivable_id" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "direction" "ReceivableWriteoffDirection" NOT NULL,
  "reason_type" TEXT NOT NULL DEFAULT '',
  "settlement_id" TEXT,
  "settlement_item_id" TEXT,
  "receipt_id" TEXT,
  "writeoff_date" DATE NOT NULL,
  "remark" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "receivable_writeoffs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refund_orders" (
  "id" TEXT NOT NULL,
  "refund_code" TEXT NOT NULL,
  "status" "RefundOrderStatus" NOT NULL DEFAULT 'pending',
  "contract_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "settlement_id" TEXT,
  "deposit_refund_id" TEXT,
  "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "refund_date" DATE,
  "payment_method" TEXT NOT NULL DEFAULT '',
  "remark" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "refund_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refund_items" (
  "id" TEXT NOT NULL,
  "refund_order_id" TEXT NOT NULL,
  "item_type" TEXT NOT NULL DEFAULT 'other',
  "description" TEXT NOT NULL DEFAULT '',
  "amount" DECIMAL(14,2) NOT NULL,
  "receivable_id" TEXT,
  "receipt_id" TEXT,
  "settlement_item_id" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "remark" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "refund_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contract_change_logs" (
  "id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "change_type" TEXT NOT NULL,
  "field_path" TEXT NOT NULL DEFAULT '',
  "before_json" TEXT NOT NULL DEFAULT '',
  "after_json" TEXT NOT NULL DEFAULT '',
  "ref_type" TEXT NOT NULL DEFAULT '',
  "ref_id" TEXT NOT NULL DEFAULT '',
  "summary" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contract_change_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cash_flows" (
  "id" TEXT NOT NULL,
  "flow_code" TEXT NOT NULL,
  "direction" "CashFlowDirection" NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "flow_date" DATE NOT NULL,
  "payment_method" TEXT NOT NULL DEFAULT '',
  "source_type" "CashFlowSourceType" NOT NULL,
  "source_id" TEXT NOT NULL,
  "contract_id" TEXT,
  "customer_id" TEXT NOT NULL,
  "receipt_id" TEXT,
  "refund_order_id" TEXT,
  "remark" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cash_flows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_settlements_settlement_code_key" ON "contract_settlements"("settlement_code");
CREATE UNIQUE INDEX "contract_settlements_lease_termination_id_key" ON "contract_settlements"("lease_termination_id");
CREATE UNIQUE INDEX "contract_settlements_deposit_refund_id_key" ON "contract_settlements"("deposit_refund_id");
CREATE INDEX "contract_settlements_contract_id_idx" ON "contract_settlements"("contract_id");
CREATE INDEX "contract_settlements_customer_id_idx" ON "contract_settlements"("customer_id");
CREATE INDEX "contract_settlements_room_id_idx" ON "contract_settlements"("room_id");
CREATE INDEX "contract_settlements_type_idx" ON "contract_settlements"("type");
CREATE INDEX "contract_settlements_status_idx" ON "contract_settlements"("status");
CREATE INDEX "contract_settlements_settlement_date_idx" ON "contract_settlements"("settlement_date");
CREATE INDEX "contract_settlements_created_by_idx" ON "contract_settlements"("created_by");
CREATE INDEX "contract_settlements_updated_by_idx" ON "contract_settlements"("updated_by");

CREATE INDEX "contract_settlement_items_settlement_id_sort_order_idx" ON "contract_settlement_items"("settlement_id", "sort_order");
CREATE INDEX "contract_settlement_items_item_type_idx" ON "contract_settlement_items"("item_type");
CREATE INDEX "contract_settlement_items_receivable_id_idx" ON "contract_settlement_items"("receivable_id");
CREATE INDEX "contract_settlement_items_invoice_id_idx" ON "contract_settlement_items"("invoice_id");
CREATE INDEX "contract_settlement_items_other_fee_id_idx" ON "contract_settlement_items"("other_fee_id");
CREATE INDEX "contract_settlement_items_created_by_idx" ON "contract_settlement_items"("created_by");
CREATE INDEX "contract_settlement_items_updated_by_idx" ON "contract_settlement_items"("updated_by");

CREATE UNIQUE INDEX "receivable_writeoffs_writeoff_code_key" ON "receivable_writeoffs"("writeoff_code");
CREATE INDEX "receivable_writeoffs_receivable_id_idx" ON "receivable_writeoffs"("receivable_id");
CREATE INDEX "receivable_writeoffs_settlement_id_idx" ON "receivable_writeoffs"("settlement_id");
CREATE INDEX "receivable_writeoffs_settlement_item_id_idx" ON "receivable_writeoffs"("settlement_item_id");
CREATE INDEX "receivable_writeoffs_receipt_id_idx" ON "receivable_writeoffs"("receipt_id");
CREATE INDEX "receivable_writeoffs_direction_idx" ON "receivable_writeoffs"("direction");
CREATE INDEX "receivable_writeoffs_reason_type_idx" ON "receivable_writeoffs"("reason_type");
CREATE INDEX "receivable_writeoffs_writeoff_date_idx" ON "receivable_writeoffs"("writeoff_date");
CREATE INDEX "receivable_writeoffs_created_by_idx" ON "receivable_writeoffs"("created_by");
CREATE INDEX "receivable_writeoffs_updated_by_idx" ON "receivable_writeoffs"("updated_by");

CREATE UNIQUE INDEX "refund_orders_refund_code_key" ON "refund_orders"("refund_code");
CREATE INDEX "refund_orders_contract_id_idx" ON "refund_orders"("contract_id");
CREATE INDEX "refund_orders_customer_id_idx" ON "refund_orders"("customer_id");
CREATE INDEX "refund_orders_settlement_id_idx" ON "refund_orders"("settlement_id");
CREATE INDEX "refund_orders_deposit_refund_id_idx" ON "refund_orders"("deposit_refund_id");
CREATE INDEX "refund_orders_status_idx" ON "refund_orders"("status");
CREATE INDEX "refund_orders_refund_date_idx" ON "refund_orders"("refund_date");
CREATE INDEX "refund_orders_created_by_idx" ON "refund_orders"("created_by");
CREATE INDEX "refund_orders_updated_by_idx" ON "refund_orders"("updated_by");

CREATE INDEX "refund_items_refund_order_id_sort_order_idx" ON "refund_items"("refund_order_id", "sort_order");
CREATE INDEX "refund_items_item_type_idx" ON "refund_items"("item_type");
CREATE INDEX "refund_items_receivable_id_idx" ON "refund_items"("receivable_id");
CREATE INDEX "refund_items_receipt_id_idx" ON "refund_items"("receipt_id");
CREATE INDEX "refund_items_settlement_item_id_idx" ON "refund_items"("settlement_item_id");
CREATE INDEX "refund_items_created_by_idx" ON "refund_items"("created_by");
CREATE INDEX "refund_items_updated_by_idx" ON "refund_items"("updated_by");

CREATE INDEX "contract_change_logs_contract_id_created_at_idx" ON "contract_change_logs"("contract_id", "created_at");
CREATE INDEX "contract_change_logs_change_type_idx" ON "contract_change_logs"("change_type");
CREATE INDEX "contract_change_logs_ref_type_ref_id_idx" ON "contract_change_logs"("ref_type", "ref_id");
CREATE INDEX "contract_change_logs_created_by_idx" ON "contract_change_logs"("created_by");

CREATE UNIQUE INDEX "cash_flows_flow_code_key" ON "cash_flows"("flow_code");
CREATE UNIQUE INDEX "cash_flows_source_type_source_id_direction_key" ON "cash_flows"("source_type", "source_id", "direction");
CREATE INDEX "cash_flows_contract_id_idx" ON "cash_flows"("contract_id");
CREATE INDEX "cash_flows_customer_id_idx" ON "cash_flows"("customer_id");
CREATE INDEX "cash_flows_receipt_id_idx" ON "cash_flows"("receipt_id");
CREATE INDEX "cash_flows_refund_order_id_idx" ON "cash_flows"("refund_order_id");
CREATE INDEX "cash_flows_direction_idx" ON "cash_flows"("direction");
CREATE INDEX "cash_flows_flow_date_idx" ON "cash_flows"("flow_date");
CREATE INDEX "cash_flows_created_by_idx" ON "cash_flows"("created_by");
CREATE INDEX "cash_flows_updated_by_idx" ON "cash_flows"("updated_by");

ALTER TABLE "contract_settlements"
  ADD CONSTRAINT "contract_settlements_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contract_settlements"
  ADD CONSTRAINT "contract_settlements_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contract_settlements"
  ADD CONSTRAINT "contract_settlements_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contract_settlements"
  ADD CONSTRAINT "contract_settlements_lease_termination_id_fkey"
  FOREIGN KEY ("lease_termination_id") REFERENCES "lease_terminations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_settlements"
  ADD CONSTRAINT "contract_settlements_deposit_refund_id_fkey"
  FOREIGN KEY ("deposit_refund_id") REFERENCES "deposit_refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_settlements"
  ADD CONSTRAINT "contract_settlements_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_settlements"
  ADD CONSTRAINT "contract_settlements_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_settlement_items"
  ADD CONSTRAINT "contract_settlement_items_settlement_id_fkey"
  FOREIGN KEY ("settlement_id") REFERENCES "contract_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_settlement_items"
  ADD CONSTRAINT "contract_settlement_items_receivable_id_fkey"
  FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_settlement_items"
  ADD CONSTRAINT "contract_settlement_items_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_settlement_items"
  ADD CONSTRAINT "contract_settlement_items_other_fee_id_fkey"
  FOREIGN KEY ("other_fee_id") REFERENCES "contract_other_fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_settlement_items"
  ADD CONSTRAINT "contract_settlement_items_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_settlement_items"
  ADD CONSTRAINT "contract_settlement_items_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receivable_writeoffs"
  ADD CONSTRAINT "receivable_writeoffs_receivable_id_fkey"
  FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_writeoffs"
  ADD CONSTRAINT "receivable_writeoffs_settlement_id_fkey"
  FOREIGN KEY ("settlement_id") REFERENCES "contract_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receivable_writeoffs"
  ADD CONSTRAINT "receivable_writeoffs_settlement_item_id_fkey"
  FOREIGN KEY ("settlement_item_id") REFERENCES "contract_settlement_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receivable_writeoffs"
  ADD CONSTRAINT "receivable_writeoffs_receipt_id_fkey"
  FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receivable_writeoffs"
  ADD CONSTRAINT "receivable_writeoffs_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receivable_writeoffs"
  ADD CONSTRAINT "receivable_writeoffs_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "refund_orders"
  ADD CONSTRAINT "refund_orders_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_orders"
  ADD CONSTRAINT "refund_orders_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_orders"
  ADD CONSTRAINT "refund_orders_settlement_id_fkey"
  FOREIGN KEY ("settlement_id") REFERENCES "contract_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refund_orders"
  ADD CONSTRAINT "refund_orders_deposit_refund_id_fkey"
  FOREIGN KEY ("deposit_refund_id") REFERENCES "deposit_refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refund_orders"
  ADD CONSTRAINT "refund_orders_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refund_orders"
  ADD CONSTRAINT "refund_orders_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "refund_items"
  ADD CONSTRAINT "refund_items_refund_order_id_fkey"
  FOREIGN KEY ("refund_order_id") REFERENCES "refund_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refund_items"
  ADD CONSTRAINT "refund_items_receivable_id_fkey"
  FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refund_items"
  ADD CONSTRAINT "refund_items_receipt_id_fkey"
  FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refund_items"
  ADD CONSTRAINT "refund_items_settlement_item_id_fkey"
  FOREIGN KEY ("settlement_item_id") REFERENCES "contract_settlement_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refund_items"
  ADD CONSTRAINT "refund_items_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refund_items"
  ADD CONSTRAINT "refund_items_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_change_logs"
  ADD CONSTRAINT "contract_change_logs_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_change_logs"
  ADD CONSTRAINT "contract_change_logs_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cash_flows"
  ADD CONSTRAINT "cash_flows_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_flows"
  ADD CONSTRAINT "cash_flows_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_flows"
  ADD CONSTRAINT "cash_flows_receipt_id_fkey"
  FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_flows"
  ADD CONSTRAINT "cash_flows_refund_order_id_fkey"
  FOREIGN KEY ("refund_order_id") REFERENCES "refund_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_flows"
  ADD CONSTRAINT "cash_flows_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_flows"
  ADD CONSTRAINT "cash_flows_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TYPE "ContractSettlementType" IS '合约结算类型：VACATE=退租，CANCEL=解约';
COMMENT ON TYPE "ContractSettlementStatus" IS '合约结算状态：executed/pending_refund/settled/cancelled';
COMMENT ON TYPE "ContractSettlementItemType" IS '结算明细行类型';
COMMENT ON TYPE "ReceivableWriteoffDirection" IS '应收核销方向：reduce/reverse';
COMMENT ON TYPE "RefundOrderStatus" IS '退款单状态：pending/paid/cancelled';
COMMENT ON TYPE "CashFlowDirection" IS '资金流水方向：in/out';
COMMENT ON TYPE "CashFlowSourceType" IS '资金流水来源：receipt/refund_order';

COMMENT ON TABLE "contract_settlements" IS '合约结算单（统一：退租 VACATE / 签约中解约 CANCEL；无审批，操作员确认即落账）';
COMMENT ON COLUMN "contract_settlements"."id" IS '主键';
COMMENT ON COLUMN "contract_settlements"."settlement_code" IS '结算编号（业务唯一，如 CST2611090001）';
COMMENT ON COLUMN "contract_settlements"."type" IS '结算类型：VACATE=退租，CANCEL=解约';
COMMENT ON COLUMN "contract_settlements"."status" IS '状态：executed=已执行，pending_refund=待退款，settled=已结清，cancelled=已作废';
COMMENT ON COLUMN "contract_settlements"."contract_id" IS '所属合约 ID';
COMMENT ON COLUMN "contract_settlements"."customer_id" IS '所属客户 ID';
COMMENT ON COLUMN "contract_settlements"."room_id" IS '所属房间 ID';
COMMENT ON COLUMN "contract_settlements"."settlement_date" IS '结算日期';
COMMENT ON COLUMN "contract_settlements"."deduction_total" IS '扣款合计（损坏／罚金等）';
COMMENT ON COLUMN "contract_settlements"."waiver_total" IS '豁免合计';
COMMENT ON COLUMN "contract_settlements"."additional_total" IS '追加费用合计';
COMMENT ON COLUMN "contract_settlements"."refund_due_total" IS '待退额度合计';
COMMENT ON COLUMN "contract_settlements"."refunded_total" IS '已退合计';
COMMENT ON COLUMN "contract_settlements"."collect_due_total" IS '客户应补缴合计';
COMMENT ON COLUMN "contract_settlements"."lease_termination_id" IS '关联旧退租单 ID（兼容双写；一退租至多一结算）';
COMMENT ON COLUMN "contract_settlements"."deposit_refund_id" IS '关联旧按金退还单 ID（兼容双写；一退还至多一结算）';
COMMENT ON COLUMN "contract_settlements"."remark" IS '备注';
COMMENT ON COLUMN "contract_settlements"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "contract_settlements"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "contract_settlements"."created_at" IS '创建时间';
COMMENT ON COLUMN "contract_settlements"."updated_at" IS '更新时间';

COMMENT ON TABLE "contract_settlement_items" IS '合约结算明细行（扣款／豁免／追加／待退／作废应收）';
COMMENT ON COLUMN "contract_settlement_items"."id" IS '主键';
COMMENT ON COLUMN "contract_settlement_items"."settlement_id" IS '所属结算单 ID';
COMMENT ON COLUMN "contract_settlement_items"."item_type" IS '行类型';
COMMENT ON COLUMN "contract_settlement_items"."description" IS '描述';
COMMENT ON COLUMN "contract_settlement_items"."amount" IS '金额（恒为正；含义由 itemType 决定）';
COMMENT ON COLUMN "contract_settlement_items"."receivable_id" IS '关联应收 ID（可选）';
COMMENT ON COLUMN "contract_settlement_items"."invoice_id" IS '关联发票 ID（可选）';
COMMENT ON COLUMN "contract_settlement_items"."other_fee_id" IS '关联合约其他费用行 ID（退租扣除追溯）';
COMMENT ON COLUMN "contract_settlement_items"."sort_order" IS '排序（0-based）';
COMMENT ON COLUMN "contract_settlement_items"."remark" IS '备注';
COMMENT ON COLUMN "contract_settlement_items"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "contract_settlement_items"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "contract_settlement_items"."created_at" IS '创建时间';
COMMENT ON COLUMN "contract_settlement_items"."updated_at" IS '更新时间';

COMMENT ON TABLE "receivable_writeoffs" IS '应收核销明细（挂账／抵扣／豁免／作废等留痕）';
COMMENT ON COLUMN "receivable_writeoffs"."id" IS '主键';
COMMENT ON COLUMN "receivable_writeoffs"."writeoff_code" IS '核销编号（业务唯一，如 WOF2611090001）';
COMMENT ON COLUMN "receivable_writeoffs"."receivable_id" IS '所属应收 ID';
COMMENT ON COLUMN "receivable_writeoffs"."amount" IS '核销金额（恒为正）';
COMMENT ON COLUMN "receivable_writeoffs"."direction" IS '方向：reduce=减少应收，reverse=反向核销';
COMMENT ON COLUMN "receivable_writeoffs"."reason_type" IS '原因类型（如 void_cancel / waiver / damage / receipt_apply）';
COMMENT ON COLUMN "receivable_writeoffs"."settlement_id" IS '所属结算单 ID（可选）';
COMMENT ON COLUMN "receivable_writeoffs"."settlement_item_id" IS '所属结算明细行 ID（可选）';
COMMENT ON COLUMN "receivable_writeoffs"."receipt_id" IS '关联收据 ID（收款核销时）';
COMMENT ON COLUMN "receivable_writeoffs"."writeoff_date" IS '核销日期';
COMMENT ON COLUMN "receivable_writeoffs"."remark" IS '备注';
COMMENT ON COLUMN "receivable_writeoffs"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "receivable_writeoffs"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "receivable_writeoffs"."created_at" IS '创建时间';
COMMENT ON COLUMN "receivable_writeoffs"."updated_at" IS '更新时间';

COMMENT ON TABLE "refund_orders" IS '退款单（出账主凭证；可延期打款）';
COMMENT ON COLUMN "refund_orders"."id" IS '主键';
COMMENT ON COLUMN "refund_orders"."refund_code" IS '退款编号（业务唯一，如 RFO2611090001）';
COMMENT ON COLUMN "refund_orders"."status" IS '状态：pending=待打款，paid=已打款，cancelled=已取消';
COMMENT ON COLUMN "refund_orders"."contract_id" IS '所属合约 ID';
COMMENT ON COLUMN "refund_orders"."customer_id" IS '所属客户 ID';
COMMENT ON COLUMN "refund_orders"."settlement_id" IS '所属结算单 ID（可选）';
COMMENT ON COLUMN "refund_orders"."deposit_refund_id" IS '关联旧按金退还单 ID（兼容双写）';
COMMENT ON COLUMN "refund_orders"."amount" IS '退款总额';
COMMENT ON COLUMN "refund_orders"."refund_date" IS '退款／打款日期（待打款可空）';
COMMENT ON COLUMN "refund_orders"."payment_method" IS '付款方式';
COMMENT ON COLUMN "refund_orders"."remark" IS '备注';
COMMENT ON COLUMN "refund_orders"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "refund_orders"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "refund_orders"."created_at" IS '创建时间';
COMMENT ON COLUMN "refund_orders"."updated_at" IS '更新时间';

COMMENT ON TABLE "refund_items" IS '退款明细';
COMMENT ON COLUMN "refund_items"."id" IS '主键';
COMMENT ON COLUMN "refund_items"."refund_order_id" IS '所属退款单 ID';
COMMENT ON COLUMN "refund_items"."item_type" IS '明细类型：booking_deposit / room_deposit / invoice_cash / other';
COMMENT ON COLUMN "refund_items"."description" IS '描述';
COMMENT ON COLUMN "refund_items"."amount" IS '金额';
COMMENT ON COLUMN "refund_items"."receivable_id" IS '关联应收 ID（可选）';
COMMENT ON COLUMN "refund_items"."receipt_id" IS '关联收据 ID（冲销现金收据时）';
COMMENT ON COLUMN "refund_items"."settlement_item_id" IS '关联结算明细行 ID（可选）';
COMMENT ON COLUMN "refund_items"."sort_order" IS '排序（0-based）';
COMMENT ON COLUMN "refund_items"."remark" IS '备注';
COMMENT ON COLUMN "refund_items"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "refund_items"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "refund_items"."created_at" IS '创建时间';
COMMENT ON COLUMN "refund_items"."updated_at" IS '更新时间';

COMMENT ON TABLE "contract_change_logs" IS '签约中合约变更审计日志（租金／押金／借出物品／解约等）';
COMMENT ON COLUMN "contract_change_logs"."id" IS '主键';
COMMENT ON COLUMN "contract_change_logs"."contract_id" IS '所属合约 ID';
COMMENT ON COLUMN "contract_change_logs"."change_type" IS '变更类型（如 rent / deposit / loan_item / cancel / invoice_sync）';
COMMENT ON COLUMN "contract_change_logs"."field_path" IS '字段路径（如 monthlyRent / roomDeposit / otherFees）';
COMMENT ON COLUMN "contract_change_logs"."before_json" IS '变更前快照（JSON 文本）';
COMMENT ON COLUMN "contract_change_logs"."after_json" IS '变更后快照（JSON 文本）';
COMMENT ON COLUMN "contract_change_logs"."ref_type" IS '关联对象类型（invoice / settlement / receipt 等）';
COMMENT ON COLUMN "contract_change_logs"."ref_id" IS '关联对象 ID';
COMMENT ON COLUMN "contract_change_logs"."summary" IS '摘要说明';
COMMENT ON COLUMN "contract_change_logs"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "contract_change_logs"."created_at" IS '创建时间';

COMMENT ON TABLE "cash_flows" IS '资金流水（仅收据入账、退款单打款驱动）';
COMMENT ON COLUMN "cash_flows"."id" IS '主键';
COMMENT ON COLUMN "cash_flows"."flow_code" IS '流水编号（业务唯一，如 CFL2611090001）';
COMMENT ON COLUMN "cash_flows"."direction" IS '方向：in=入账，out=出账';
COMMENT ON COLUMN "cash_flows"."amount" IS '金额（恒为正）';
COMMENT ON COLUMN "cash_flows"."flow_date" IS '发生日期';
COMMENT ON COLUMN "cash_flows"."payment_method" IS '付款方式';
COMMENT ON COLUMN "cash_flows"."source_type" IS '来源类型：receipt / refund_order';
COMMENT ON COLUMN "cash_flows"."source_id" IS '来源单据 ID';
COMMENT ON COLUMN "cash_flows"."contract_id" IS '所属合约 ID（可选）';
COMMENT ON COLUMN "cash_flows"."customer_id" IS '所属客户 ID';
COMMENT ON COLUMN "cash_flows"."receipt_id" IS '关联收据 ID（入账时；与 source 冗余便于查询）';
COMMENT ON COLUMN "cash_flows"."refund_order_id" IS '关联退款单 ID（出账时）';
COMMENT ON COLUMN "cash_flows"."remark" IS '备注';
COMMENT ON COLUMN "cash_flows"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "cash_flows"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "cash_flows"."created_at" IS '创建时间';
COMMENT ON COLUMN "cash_flows"."updated_at" IS '更新时间';
