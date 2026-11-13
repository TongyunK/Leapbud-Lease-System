-- 回填既有结算单／退款单：退租日、按金总额、房间、经办人（幂等）

-- 1) 有关联按金退还：补 termination_date / deposit_total
UPDATE "contract_settlements" cs
SET
  "termination_date" = COALESCE(cs."termination_date", dr."termination_date"),
  "deposit_total" = CASE
    WHEN COALESCE(cs."deposit_total", 0) > 0 THEN cs."deposit_total"
    ELSE COALESCE(dr."total_deposit", 0)
  END,
  "updated_at" = CURRENT_TIMESTAMP
FROM "deposit_refunds" dr
WHERE cs."deposit_refund_id" = dr."id"
  AND (
    cs."termination_date" IS NULL
    OR COALESCE(cs."deposit_total", 0) = 0
  );

-- 2) 有关联退租单：补 termination_date
UPDATE "contract_settlements" cs
SET
  "termination_date" = COALESCE(cs."termination_date", lt."termination_date"),
  "updated_at" = CURRENT_TIMESTAMP
FROM "lease_terminations" lt
WHERE cs."lease_termination_id" = lt."id"
  AND cs."termination_date" IS NULL;

-- 3) 退款单补 room_id / handler_id（子查询，避免 UPDATE…FROM 引用目标表歧义）
UPDATE "refund_orders" ro
SET
  "room_id" = COALESCE(
    ro."room_id",
    (SELECT cs."room_id" FROM "contract_settlements" cs WHERE cs."id" = ro."settlement_id"),
    (SELECT dr."room_id" FROM "deposit_refunds" dr WHERE dr."id" = ro."deposit_refund_id"),
    (SELECT c."room_id" FROM "contracts" c WHERE c."id" = ro."contract_id")
  ),
  "handler_id" = COALESCE(
    ro."handler_id",
    (SELECT dr."handler_id" FROM "deposit_refunds" dr WHERE dr."id" = ro."deposit_refund_id")
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE ro."room_id" IS NULL
   OR (
     ro."handler_id" IS NULL
     AND EXISTS (
       SELECT 1
       FROM "deposit_refunds" dr
       WHERE dr."id" = ro."deposit_refund_id"
         AND dr."handler_id" IS NOT NULL
     )
   );

-- 4) 附件再同步（幂等）
INSERT INTO "refund_order_attachments" (
  "id", "refund_order_id", "file_name", "storage_key", "sort_order",
  "created_by", "updated_by", "created_at", "updated_at"
)
SELECT
  md5('roa:' || att."id"),
  ro."id",
  att."file_name",
  att."storage_key",
  att."sort_order",
  att."created_by",
  att."updated_by",
  att."created_at",
  att."updated_at"
FROM "deposit_refund_attachments" att
JOIN "refund_orders" ro ON ro."deposit_refund_id" = att."deposit_refund_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "refund_order_attachments" x
  WHERE x."refund_order_id" = ro."id" AND x."storage_key" = att."storage_key"
);
