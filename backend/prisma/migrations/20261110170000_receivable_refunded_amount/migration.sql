-- 应收增加「已退金额」：已收保留历史累计，已退单独累加；未收 = 开票 − 已收 + 已退
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "refunded_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN "receivables"."received_amount" IS '已收金额（历史累计实收，含已冲销／已退的收款；不含仅作废未交）';
COMMENT ON COLUMN "receivables"."refunded_amount" IS '已退金额（冲销另收、实退按金等退回租客的累计）';
COMMENT ON COLUMN "receivables"."receivable_amount" IS '应收金额／未收（= 开票金额 − 已收金额 + 已退金额）';

-- 回填：已作廢发票现金收据对应分摊 → 已退；已收补回这部分（此前同步不含已作廢）
UPDATE "receivables" r
SET
  "refunded_amount" = v.voided,
  "received_amount" = ROUND((r."received_amount" + v.voided)::numeric, 2)
FROM (
  SELECT
    x."receivable_id" AS id,
    ROUND(SUM(x.amt)::numeric, 2) AS voided
  FROM (
    SELECT
      a."receivable_id" AS receivable_id,
      a."amount" AS amt
    FROM "receipt_allocations" a
    INNER JOIN "receipts" rc ON rc."id" = a."receipt_id"
    WHERE rc."status" = '已作廢'
      AND rc."kind" = 'invoice'
      AND COALESCE(rc."payment_method", '') <> '定金抵扣'
    UNION ALL
    SELECT
      rc."receivable_id" AS receivable_id,
      rc."amount" AS amt
    FROM "receipts" rc
    WHERE rc."status" = '已作廢'
      AND rc."kind" = 'invoice'
      AND rc."receivable_id" IS NOT NULL
      AND COALESCE(rc."payment_method", '') <> '定金抵扣'
      AND NOT EXISTS (
        SELECT 1 FROM "receipt_allocations" a2 WHERE a2."receipt_id" = rc."id"
      )
  ) x
  WHERE x."receivable_id" IS NOT NULL
  GROUP BY x."receivable_id"
) v
WHERE r."id" = v.id
  AND v.voided > 0.009;

-- 未收按新公式重算（保持与已收／已退一致）
UPDATE "receivables"
SET "receivable_amount" = GREATEST(
  0,
  ROUND(("invoice_amount" - "received_amount" + "refunded_amount")::numeric, 2)
);
