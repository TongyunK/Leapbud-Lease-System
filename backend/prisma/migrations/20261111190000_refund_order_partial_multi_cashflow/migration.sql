-- 退款单：partial 枚举、paid_amount；资金流水允许多次退款出账（收据仍部分唯一）
-- 注意：本迁移不同事务内使用新枚举值 partial（PG 限制）；数据合并见下一迁移。

ALTER TYPE "RefundOrderStatus" ADD VALUE IF NOT EXISTS 'partial';

ALTER TABLE "refund_orders"
  ADD COLUMN IF NOT EXISTS "paid_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN "refund_orders"."paid_amount" IS '已打款合计（由出账流水回写）';
COMMENT ON COLUMN "refund_orders"."amount" IS '应退总额（创建后不因分次打款缩小）';
COMMENT ON COLUMN "refund_orders"."refund_date" IS '最近一次打款日期（无打款可空）';
COMMENT ON COLUMN "refund_orders"."status" IS 'pending=待打款，partial=部分打款，paid=已打款，cancelled=已取消';
COMMENT ON COLUMN "refund_orders"."settlement_id" IS '所属结算单 ID（可选；业务上同一结算至多一张未取消退款单）';
COMMENT ON TYPE "RefundOrderStatus" IS '退款单状态：pending / partial / paid / cancelled';

ALTER TABLE "cash_flows"
  DROP CONSTRAINT IF EXISTS "cash_flows_source_type_source_id_direction_key";

CREATE UNIQUE INDEX IF NOT EXISTS "cash_flows_receipt_in_unique"
  ON "cash_flows" ("source_id")
  WHERE "source_type" = 'receipt' AND "direction" = 'in';

CREATE UNIQUE INDEX IF NOT EXISTS "cash_flows_receipt_out_unique"
  ON "cash_flows" ("source_id")
  WHERE "source_type" = 'receipt' AND "direction" = 'out';

CREATE INDEX IF NOT EXISTS "cash_flows_source_type_source_id_direction_idx"
  ON "cash_flows" ("source_type", "source_id", "direction");

COMMENT ON TABLE "cash_flows" IS '资金流水（收据入账／退款出账；退款单可对应多条出账）';

-- 先回填 paid_amount（不写入 partial；下一迁移再定状态）
UPDATE refund_orders ro
SET
  paid_amount = COALESCE((
    SELECT SUM(cf.amount)
    FROM cash_flows cf
    WHERE cf.refund_order_id = ro.id AND cf.direction = 'out'
  ), 0),
  updated_at = NOW();
