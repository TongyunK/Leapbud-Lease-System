-- 收据分摊明细：一张发票收据可覆盖同一合约下多张应收
CREATE TABLE "receipt_allocations" (
  "id" TEXT NOT NULL,
  "receipt_id" TEXT NOT NULL,
  "receivable_id" TEXT NOT NULL,
  "invoice_id" TEXT,
  "amount" DECIMAL(14, 2) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "remark" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "receipt_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "receipt_allocations_receipt_id_receivable_id_key"
  ON "receipt_allocations"("receipt_id", "receivable_id");

CREATE INDEX "receipt_allocations_receipt_id_sort_order_idx"
  ON "receipt_allocations"("receipt_id", "sort_order");
CREATE INDEX "receipt_allocations_receivable_id_idx"
  ON "receipt_allocations"("receivable_id");
CREATE INDEX "receipt_allocations_invoice_id_idx"
  ON "receipt_allocations"("invoice_id");
CREATE INDEX "receipt_allocations_created_by_idx"
  ON "receipt_allocations"("created_by");
CREATE INDEX "receipt_allocations_updated_by_idx"
  ON "receipt_allocations"("updated_by");

ALTER TABLE "receipt_allocations"
  ADD CONSTRAINT "receipt_allocations_receipt_id_fkey"
  FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receipt_allocations"
  ADD CONSTRAINT "receipt_allocations_receivable_id_fkey"
  FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receipt_allocations"
  ADD CONSTRAINT "receipt_allocations_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receipt_allocations"
  ADD CONSTRAINT "receipt_allocations_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "receipt_allocations" IS '收据分摊明细（一张发票收据可覆盖多张应收；金额合计应等于收据金额）';
COMMENT ON COLUMN "receipt_allocations"."id" IS '主键';
COMMENT ON COLUMN "receipt_allocations"."receipt_id" IS '所属收据 ID';
COMMENT ON COLUMN "receipt_allocations"."receivable_id" IS '所属应收帐 ID';
COMMENT ON COLUMN "receipt_allocations"."invoice_id" IS '所属发票 ID（冗余，便于列表／打印）';
COMMENT ON COLUMN "receipt_allocations"."amount" IS '分摊到该应收的金额';
COMMENT ON COLUMN "receipt_allocations"."sort_order" IS '排序（0-based，同次收款 FIFO 顺序）';
COMMENT ON COLUMN "receipt_allocations"."remark" IS '备注';
COMMENT ON COLUMN "receipt_allocations"."created_by" IS '创建人';
COMMENT ON COLUMN "receipt_allocations"."updated_by" IS '更新人';
COMMENT ON COLUMN "receipt_allocations"."created_at" IS '创建时间';
COMMENT ON COLUMN "receipt_allocations"."updated_at" IS '更新时间';

-- 回填：已有挂应收的收据各生成一条分摊（金额=收据金额）
INSERT INTO "receipt_allocations" (
  "id",
  "receipt_id",
  "receivable_id",
  "invoice_id",
  "amount",
  "sort_order",
  "remark",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at"
)
SELECT
  md5(random()::text || clock_timestamp()::text || r.id)::text,
  r.id,
  r.receivable_id,
  r.invoice_id,
  r.amount,
  0,
  '',
  r.created_by,
  r.updated_by,
  r.created_at,
  r.updated_at
FROM "receipts" r
WHERE r.receivable_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "receipt_allocations" a WHERE a.receipt_id = r.id
  );
