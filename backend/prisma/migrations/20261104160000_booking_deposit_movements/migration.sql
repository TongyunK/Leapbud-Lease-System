-- 定金动账类型
CREATE TYPE "BookingDepositMovementType" AS ENUM ('apply', 'refund');

COMMENT ON TYPE "BookingDepositMovementType" IS '定金动账类型：apply=抵扣应收，refund=退还';

-- 按金退还：一并退还的定金余额
ALTER TABLE "deposit_refunds"
  ADD COLUMN "booking_deposit_refund_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN "deposit_refunds"."booking_deposit_refund_amount" IS '一并退还的定金余额（挂账余款；0 表示不退定金）';

-- 定金动账表
CREATE TABLE "booking_deposit_movements" (
  "id" TEXT NOT NULL,
  "booking_deposit_receipt_id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "type" "BookingDepositMovementType" NOT NULL,
  "amount" DECIMAL(14, 2) NOT NULL,
  "movement_date" DATE NOT NULL,
  "receivable_id" TEXT,
  "invoice_id" TEXT,
  "offset_receipt_id" TEXT,
  "deposit_refund_id" TEXT,
  "remark" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "booking_deposit_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_deposit_movements_offset_receipt_id_key"
  ON "booking_deposit_movements"("offset_receipt_id");

CREATE INDEX "booking_deposit_movements_booking_deposit_receipt_id_idx"
  ON "booking_deposit_movements"("booking_deposit_receipt_id");
CREATE INDEX "booking_deposit_movements_contract_id_idx"
  ON "booking_deposit_movements"("contract_id");
CREATE INDEX "booking_deposit_movements_type_idx"
  ON "booking_deposit_movements"("type");
CREATE INDEX "booking_deposit_movements_receivable_id_idx"
  ON "booking_deposit_movements"("receivable_id");
CREATE INDEX "booking_deposit_movements_deposit_refund_id_idx"
  ON "booking_deposit_movements"("deposit_refund_id");
CREATE INDEX "booking_deposit_movements_movement_date_idx"
  ON "booking_deposit_movements"("movement_date");
CREATE INDEX "booking_deposit_movements_created_by_idx"
  ON "booking_deposit_movements"("created_by");
CREATE INDEX "booking_deposit_movements_updated_by_idx"
  ON "booking_deposit_movements"("updated_by");

ALTER TABLE "booking_deposit_movements"
  ADD CONSTRAINT "booking_deposit_movements_booking_deposit_receipt_id_fkey"
  FOREIGN KEY ("booking_deposit_receipt_id") REFERENCES "receipts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_deposit_movements"
  ADD CONSTRAINT "booking_deposit_movements_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_deposit_movements"
  ADD CONSTRAINT "booking_deposit_movements_offset_receipt_id_fkey"
  FOREIGN KEY ("offset_receipt_id") REFERENCES "receipts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "booking_deposit_movements"
  ADD CONSTRAINT "booking_deposit_movements_deposit_refund_id_fkey"
  FOREIGN KEY ("deposit_refund_id") REFERENCES "deposit_refunds"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "booking_deposit_movements"
  ADD CONSTRAINT "booking_deposit_movements_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "booking_deposit_movements"
  ADD CONSTRAINT "booking_deposit_movements_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "booking_deposit_movements" IS '定金动账（抵扣应收 / 退还；余额 = 定金收据金额 − Σ动账金额）';
COMMENT ON COLUMN "booking_deposit_movements"."id" IS '主键';
COMMENT ON COLUMN "booking_deposit_movements"."booking_deposit_receipt_id" IS '所属定金收据 ID';
COMMENT ON COLUMN "booking_deposit_movements"."contract_id" IS '所属合约 ID';
COMMENT ON COLUMN "booking_deposit_movements"."type" IS '动账类型：apply=抵扣应收，refund=退还';
COMMENT ON COLUMN "booking_deposit_movements"."amount" IS '动账金额（恒为正；方向由 type 决定）';
COMMENT ON COLUMN "booking_deposit_movements"."movement_date" IS '动账日期';
COMMENT ON COLUMN "booking_deposit_movements"."receivable_id" IS '抵扣关联应收 ID（仅 apply）';
COMMENT ON COLUMN "booking_deposit_movements"."invoice_id" IS '抵扣关联发票 ID（仅 apply）';
COMMENT ON COLUMN "booking_deposit_movements"."offset_receipt_id" IS '抵扣时开出的发票收据 ID（支付方式=定金抵扣）';
COMMENT ON COLUMN "booking_deposit_movements"."deposit_refund_id" IS '退租/按金退还办理单 ID（退还时可选）';
COMMENT ON COLUMN "booking_deposit_movements"."remark" IS '备注';
COMMENT ON COLUMN "booking_deposit_movements"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "booking_deposit_movements"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "booking_deposit_movements"."created_at" IS '创建时间';
COMMENT ON COLUMN "booking_deposit_movements"."updated_at" IS '更新时间';
