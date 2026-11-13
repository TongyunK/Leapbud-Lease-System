-- 结算单补充退租日／按金总额；退款单补充房间／经办人／附件；定金动账挂退款单
-- 并将历史 deposit_refunds 回填为 settlement + refund_order

-- ========== 结构 ==========
ALTER TABLE "contract_settlements"
  ADD COLUMN IF NOT EXISTS "termination_date" DATE,
  ADD COLUMN IF NOT EXISTS "deposit_total" DECIMAL(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN "contract_settlements"."termination_date" IS '退租日期（业务日；可与结算日期不同；解约可空）';
COMMENT ON COLUMN "contract_settlements"."deposit_total" IS '按金总额快照（结算时合约按金；便于对照扣除后应退）';

CREATE INDEX IF NOT EXISTS "contract_settlements_termination_date_idx"
  ON "contract_settlements"("termination_date");

ALTER TABLE "refund_orders"
  ADD COLUMN IF NOT EXISTS "room_id" TEXT,
  ADD COLUMN IF NOT EXISTS "handler_id" TEXT;

COMMENT ON COLUMN "refund_orders"."room_id" IS '所属房间 ID（冗余便于列表；可空，由合约带出）';
COMMENT ON COLUMN "refund_orders"."handler_id" IS '打款经办人用户 ID';

DO $$ BEGIN
  ALTER TABLE "refund_orders"
    ADD CONSTRAINT "refund_orders_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "refund_orders"
    ADD CONSTRAINT "refund_orders_handler_id_fkey"
    FOREIGN KEY ("handler_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "refund_orders_room_id_idx" ON "refund_orders"("room_id");
CREATE INDEX IF NOT EXISTS "refund_orders_handler_id_idx" ON "refund_orders"("handler_id");

CREATE TABLE IF NOT EXISTS "refund_order_attachments" (
  "id" TEXT NOT NULL,
  "refund_order_id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "refund_order_attachments_pkey" PRIMARY KEY ("id")
);

COMMENT ON TABLE "refund_order_attachments" IS '退款单打款凭证附件（一退款单多文件）';
COMMENT ON COLUMN "refund_order_attachments"."id" IS '主键';
COMMENT ON COLUMN "refund_order_attachments"."refund_order_id" IS '所属退款单 ID';
COMMENT ON COLUMN "refund_order_attachments"."file_name" IS '原始文件名';
COMMENT ON COLUMN "refund_order_attachments"."storage_key" IS '存储相对路径（相对 uploads 根；或以 http(s) 开头的外部地址）';
COMMENT ON COLUMN "refund_order_attachments"."sort_order" IS '展示排序（越小越靠前）';
COMMENT ON COLUMN "refund_order_attachments"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "refund_order_attachments"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "refund_order_attachments"."created_at" IS '创建时间';
COMMENT ON COLUMN "refund_order_attachments"."updated_at" IS '更新时间';

DO $$ BEGIN
  ALTER TABLE "refund_order_attachments"
    ADD CONSTRAINT "refund_order_attachments_refund_order_id_fkey"
    FOREIGN KEY ("refund_order_id") REFERENCES "refund_orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "refund_order_attachments"
    ADD CONSTRAINT "refund_order_attachments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "refund_order_attachments"
    ADD CONSTRAINT "refund_order_attachments_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "refund_order_attachments_refund_order_id_sort_order_idx"
  ON "refund_order_attachments"("refund_order_id", "sort_order");
CREATE INDEX IF NOT EXISTS "refund_order_attachments_created_by_idx"
  ON "refund_order_attachments"("created_by");
CREATE INDEX IF NOT EXISTS "refund_order_attachments_updated_by_idx"
  ON "refund_order_attachments"("updated_by");

ALTER TABLE "booking_deposit_movements"
  ADD COLUMN IF NOT EXISTS "refund_order_id" TEXT;

COMMENT ON COLUMN "booking_deposit_movements"."refund_order_id" IS '关联退款单 ID（退还定金时优先挂出账单）';

DO $$ BEGIN
  ALTER TABLE "booking_deposit_movements"
    ADD CONSTRAINT "booking_deposit_movements_refund_order_id_fkey"
    FOREIGN KEY ("refund_order_id") REFERENCES "refund_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "booking_deposit_movements_refund_order_id_idx"
  ON "booking_deposit_movements"("refund_order_id");

-- ========== 数据回填：DepositRefund → Settlement + RefundOrder ==========
WITH src AS (
  SELECT
    dr.*,
    lt.id AS lt_id,
    row_number() OVER (ORDER BY dr.created_at, dr.id) AS rn
  FROM deposit_refunds dr
  LEFT JOIN lease_terminations lt ON lt.deposit_refund_id = dr.id
  WHERE NOT EXISTS (
    SELECT 1 FROM contract_settlements cs WHERE cs.deposit_refund_id = dr.id
  )
),
ins_settlement AS (
  INSERT INTO contract_settlements (
    id, settlement_code, type, status,
    contract_id, customer_id, room_id,
    settlement_date, termination_date, deposit_total,
    deduction_total, waiver_total, additional_total,
    refund_due_total, refunded_total, collect_due_total,
    lease_termination_id, deposit_refund_id, remark,
    created_by, updated_by, created_at, updated_at
  )
  SELECT
    md5('cs:' || s.id),
    'CST' || to_char(COALESCE(s.refund_date, s.termination_date, s.created_at::date), 'YYMMDD')
      || lpad((1000 + s.rn)::text, 4, '0'),
    'VACATE',
    CASE
      WHEN s.status = '已退' THEN 'settled'::"ContractSettlementStatus"
      WHEN s.status = '已取消' THEN 'cancelled'::"ContractSettlementStatus"
      WHEN (COALESCE(s.actual_refund_amount, 0) + COALESCE(s.booking_deposit_refund_amount, 0)) > 0
        THEN 'pending_refund'::"ContractSettlementStatus"
      ELSE 'executed'::"ContractSettlementStatus"
    END,
    s.contract_id,
    s.customer_id,
    s.room_id,
    COALESCE(s.refund_date, s.termination_date, s.created_at::date),
    s.termination_date,
    COALESCE(s.total_deposit, 0),
    0, 0, 0,
    CASE
      WHEN s.status = '已退' THEN 0
      ELSE COALESCE(s.actual_refund_amount, 0) + COALESCE(s.booking_deposit_refund_amount, 0)
    END,
    CASE
      WHEN s.status = '已退'
        THEN COALESCE(s.actual_refund_amount, 0) + COALESCE(s.booking_deposit_refund_amount, 0)
      ELSE 0
    END,
    0,
    s.lt_id,
    s.id,
    CONCAT_WS(
      E'\n',
      NULLIF(TRIM(s.remark), ''),
      CONCAT('migrated from deposit_refund ', s.refund_code, ' (', s.status, ')')
    ),
    s.created_by,
    s.updated_by,
    s.created_at,
    s.updated_at
  FROM src s
  RETURNING id, deposit_refund_id, created_by, updated_by, created_at, updated_at
),
ins_order AS (
  INSERT INTO refund_orders (
    id, refund_code, status,
    contract_id, customer_id, room_id,
    settlement_id, deposit_refund_id,
    amount, refund_date, payment_method, handler_id, remark,
    created_by, updated_by, created_at, updated_at
  )
  SELECT
    md5('ro:' || s.id),
    'RFO' || to_char(COALESCE(s.refund_date, s.termination_date, s.created_at::date), 'YYMMDD')
      || lpad((1000 + s.rn)::text, 4, '0'),
    CASE
      WHEN s.status = '已退' THEN 'paid'::"RefundOrderStatus"
      WHEN s.status = '已取消' THEN 'cancelled'::"RefundOrderStatus"
      ELSE 'pending'::"RefundOrderStatus"
    END,
    s.contract_id,
    s.customer_id,
    s.room_id,
    st.id,
    s.id,
    COALESCE(s.actual_refund_amount, 0) + COALESCE(s.booking_deposit_refund_amount, 0),
    s.refund_date,
    '',
    s.handler_id,
    CONCAT_WS(
      E'\n',
      NULLIF(TRIM(s.remark), ''),
      CONCAT('migrated from deposit_refund ', s.refund_code)
    ),
    s.created_by,
    s.updated_by,
    s.created_at,
    s.updated_at
  FROM src s
  JOIN ins_settlement st ON st.deposit_refund_id = s.id
  WHERE (COALESCE(s.actual_refund_amount, 0) + COALESCE(s.booking_deposit_refund_amount, 0)) > 0
     OR s.status IN ('已退', '未退', '草稿', '已取消')
  RETURNING id, deposit_refund_id
)
INSERT INTO refund_items (
  id, refund_order_id, item_type, description, amount,
  receivable_id, receipt_id, settlement_item_id, sort_order, remark,
  created_by, updated_by, created_at, updated_at
)
SELECT
  md5('ri:room:' || s.id),
  o.id,
  'room_deposit',
  '按金退还',
  COALESCE(s.actual_refund_amount, 0),
  NULL, NULL, NULL, 0, '',
  s.created_by, s.updated_by, s.created_at, s.updated_at
FROM src s
JOIN ins_order o ON o.deposit_refund_id = s.id
WHERE COALESCE(s.actual_refund_amount, 0) > 0
UNION ALL
SELECT
  md5('ri:booking:' || s.id),
  o.id,
  'booking_deposit',
  '一并退还定金',
  COALESCE(s.booking_deposit_refund_amount, 0),
  NULL, NULL, NULL, 1, '',
  s.created_by, s.updated_by, s.created_at, s.updated_at
FROM src s
JOIN ins_order o ON o.deposit_refund_id = s.id
WHERE COALESCE(s.booking_deposit_refund_amount, 0) > 0;

-- 结算明细：退租扣除项（ContractOtherFee 挂退租）
INSERT INTO contract_settlement_items (
  id, settlement_id, item_type, description, amount,
  receivable_id, invoice_id, other_fee_id, sort_order, remark,
  created_by, updated_by, created_at, updated_at
)
SELECT
  md5('csi:' || fee.id),
  cs.id,
  'DAMAGE_DEDUCTION'::"ContractSettlementItemType",
  COALESCE(NULLIF(TRIM(fee.description), ''), '按金扣除'),
  COALESCE(fee.subtotal, 0),
  NULL, NULL, fee.id,
  COALESCE(fee.sort_order, 0),
  COALESCE(fee.remark, ''),
  fee.created_by, fee.updated_by, fee.created_at, fee.updated_at
FROM contract_other_fees fee
JOIN lease_terminations lt ON lt.id = fee.termination_id
JOIN contract_settlements cs ON cs.lease_termination_id = lt.id
WHERE COALESCE(fee.subtotal, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM contract_settlement_items i WHERE i.other_fee_id = fee.id
  );

-- 回填结算扣款合计
UPDATE contract_settlements cs
SET
  deduction_total = COALESCE((
    SELECT SUM(i.amount) FROM contract_settlement_items i
    WHERE i.settlement_id = cs.id
      AND i.item_type IN ('DAMAGE_DEDUCTION', 'PENALTY_DEDUCTION')
  ), 0),
  updated_at = CURRENT_TIMESTAMP
WHERE cs.deposit_refund_id IS NOT NULL;

-- 附件迁移
INSERT INTO refund_order_attachments (
  id, refund_order_id, file_name, storage_key, sort_order,
  created_by, updated_by, created_at, updated_at
)
SELECT
  md5('roa:' || att.id),
  ro.id,
  att.file_name,
  att.storage_key,
  att.sort_order,
  att.created_by,
  att.updated_by,
  att.created_at,
  att.updated_at
FROM deposit_refund_attachments att
JOIN refund_orders ro ON ro.deposit_refund_id = att.deposit_refund_id
WHERE NOT EXISTS (
  SELECT 1 FROM refund_order_attachments x
  WHERE x.refund_order_id = ro.id AND x.storage_key = att.storage_key
);

-- 定金动账挂退款单
UPDATE booking_deposit_movements m
SET refund_order_id = ro.id,
    updated_at = CURRENT_TIMESTAMP
FROM refund_orders ro
WHERE m.deposit_refund_id IS NOT NULL
  AND ro.deposit_refund_id = m.deposit_refund_id
  AND m.refund_order_id IS NULL;

-- 已退：补记资金流出（幂等：同 source 不重复）
INSERT INTO cash_flows (
  id, flow_code, direction, amount, flow_date, payment_method,
  source_type, source_id, contract_id, customer_id,
  receipt_id, refund_order_id, remark,
  created_by, updated_by, created_at, updated_at
)
SELECT
  md5('cf:out:' || ro.id),
  'CFL' || to_char(COALESCE(ro.refund_date, CURRENT_DATE), 'YYMMDD')
    || lpad((
      2000 + row_number() OVER (ORDER BY ro.created_at, ro.id)
    )::text, 4, '0'),
  'out',
  ro.amount,
  COALESCE(ro.refund_date, CURRENT_DATE),
  COALESCE(ro.payment_method, ''),
  'refund_order',
  ro.id,
  ro.contract_id,
  ro.customer_id,
  NULL,
  ro.id,
  'migrated refund paid outflow',
  ro.created_by,
  ro.updated_by,
  ro.created_at,
  CURRENT_TIMESTAMP
FROM refund_orders ro
WHERE ro.status = 'paid'
  AND ro.amount > 0
  AND ro.deposit_refund_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cash_flows cf
    WHERE cf.source_type = 'refund_order'
      AND cf.source_id = ro.id
      AND cf.direction = 'out'
  );
