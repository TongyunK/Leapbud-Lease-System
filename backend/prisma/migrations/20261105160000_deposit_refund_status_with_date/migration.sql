-- 已填退款日期但仍标「未退按金」的记录，校正为「已退按金」
UPDATE "deposit_refunds"
SET "status" = '已退按金',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = '未退按金'
  AND "refund_date" IS NOT NULL;
