-- 退租记录合并进合约结算单：加字段 → 回填 → 改 other_fees → 删 lease_terminations

-- 1) 结算单：退租现场字段
ALTER TABLE "contract_settlements"
  ADD COLUMN IF NOT EXISTS "termination_kind" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "reason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "notice_attachment" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "door_key_returned_qty" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "smart_card_returned_qty" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "site_condition" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "legacy_termination_code" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "contract_settlements_legacy_termination_code_idx"
  ON "contract_settlements"("legacy_termination_code");

COMMENT ON COLUMN "contract_settlements"."termination_kind" IS '退租类型：expiry=到期退租，early=提前退租（仅 VACATE；CANCEL 为空）';
COMMENT ON COLUMN "contract_settlements"."reason" IS '退租原因（仅 VACATE）';
COMMENT ON COLUMN "contract_settlements"."notice_attachment" IS '客户书面通知附件路径（仅 VACATE）';
COMMENT ON COLUMN "contract_settlements"."door_key_returned_qty" IS '房门匙已回收数量（仅 VACATE）';
COMMENT ON COLUMN "contract_settlements"."smart_card_returned_qty" IS '智能卡（信箱匙）已回收数量（仅 VACATE）';
COMMENT ON COLUMN "contract_settlements"."site_condition" IS '现场情况（仅 VACATE）';
COMMENT ON COLUMN "contract_settlements"."legacy_termination_code" IS '旧退租编号（历史回填 TRM…；新单为空）';

-- 2) other_fees：先加 settlement_id
ALTER TABLE "contract_other_fees"
  ADD COLUMN IF NOT EXISTS "settlement_id" TEXT;

CREATE INDEX IF NOT EXISTS "contract_other_fees_settlement_id_idx"
  ON "contract_other_fees"("settlement_id");

COMMENT ON COLUMN "contract_other_fees"."settlement_id" IS '所属合约结算单 ID（可选；退租／结算按金扣除时填写）';

-- 3) 有关联结算的退租 → 回填现场字段到结算
UPDATE "contract_settlements" AS cs
SET
  "termination_kind" = COALESCE(lt."termination_kind", ''),
  "reason" = COALESCE(lt."reason", ''),
  "notice_attachment" = COALESCE(lt."notice_attachment", ''),
  "door_key_returned_qty" = COALESCE(lt."door_key_returned_qty", 0),
  "smart_card_returned_qty" = COALESCE(lt."smart_card_returned_qty", 0),
  "site_condition" = COALESCE(lt."site_condition", ''),
  "legacy_termination_code" = COALESCE(lt."termination_code", ''),
  "termination_date" = COALESCE(cs."termination_date", lt."termination_date"),
  "remark" = CASE
    WHEN COALESCE(cs."remark", '') = '' THEN COALESCE(lt."remark", '')
    ELSE cs."remark"
  END,
  "deposit_refund_id" = COALESCE(cs."deposit_refund_id", lt."deposit_refund_id")
FROM "lease_terminations" AS lt
WHERE cs."lease_termination_id" = lt."id";

-- 4) 孤立退租（无结算）→ 补建 VACATE 结算
INSERT INTO "contract_settlements" (
  "id",
  "settlement_code",
  "type",
  "status",
  "contract_id",
  "customer_id",
  "room_id",
  "settlement_date",
  "termination_date",
  "deposit_total",
  "deduction_total",
  "waiver_total",
  "additional_total",
  "refund_due_total",
  "refunded_total",
  "collect_due_total",
  "lease_termination_id",
  "deposit_refund_id",
  "termination_kind",
  "reason",
  "notice_attachment",
  "door_key_returned_qty",
  "smart_card_returned_qty",
  "site_condition",
  "legacy_termination_code",
  "remark",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at"
)
SELECT
  'mig_' || lt."id",
  'CST-MIG-' || lt."termination_code",
  'VACATE'::"ContractSettlementType",
  'executed'::"ContractSettlementStatus",
  lt."contract_id",
  lt."customer_id",
  lt."room_id",
  COALESCE(lt."termination_date", lt."created_at"::date),
  lt."termination_date",
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  lt."id",
  lt."deposit_refund_id",
  COALESCE(lt."termination_kind", ''),
  COALESCE(lt."reason", ''),
  COALESCE(lt."notice_attachment", ''),
  COALESCE(lt."door_key_returned_qty", 0),
  COALESCE(lt."smart_card_returned_qty", 0),
  COALESCE(lt."site_condition", ''),
  COALESCE(lt."termination_code", ''),
  COALESCE(lt."remark", ''),
  lt."created_by",
  lt."updated_by",
  lt."created_at",
  lt."updated_at"
FROM "lease_terminations" AS lt
WHERE NOT EXISTS (
  SELECT 1 FROM "contract_settlements" AS cs WHERE cs."lease_termination_id" = lt."id"
)
ON CONFLICT ("settlement_code") DO NOTHING;

-- 5) other_fees.settlement_id 回填（经 termination → settlement）
UPDATE "contract_other_fees" AS ofee
SET "settlement_id" = cs."id"
FROM "contract_settlements" AS cs
WHERE ofee."termination_id" IS NOT NULL
  AND cs."lease_termination_id" = ofee."termination_id"
  AND ofee."settlement_id" IS NULL;

-- 亦经 settlement_items.other_fee_id 回填
UPDATE "contract_other_fees" AS ofee
SET "settlement_id" = si."settlement_id"
FROM "contract_settlement_items" AS si
WHERE si."other_fee_id" = ofee."id"
  AND ofee."settlement_id" IS NULL;

-- 6) other_fees：挂 FK，去掉 termination_id
ALTER TABLE "contract_other_fees"
  DROP CONSTRAINT IF EXISTS "contract_other_fees_termination_id_fkey";

DROP INDEX IF EXISTS "contract_other_fees_termination_id_idx";

ALTER TABLE "contract_other_fees"
  DROP COLUMN IF EXISTS "termination_id";

ALTER TABLE "contract_other_fees"
  ADD CONSTRAINT "contract_other_fees_settlement_id_fkey"
  FOREIGN KEY ("settlement_id") REFERENCES "contract_settlements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7) 结算去掉 lease_termination_id
ALTER TABLE "contract_settlements"
  DROP CONSTRAINT IF EXISTS "contract_settlements_lease_termination_id_fkey";

DROP INDEX IF EXISTS "contract_settlements_lease_termination_id_key";

ALTER TABLE "contract_settlements"
  DROP COLUMN IF EXISTS "lease_termination_id";

-- 8) 删除退租表（先清对 deposit_refunds 的 FK）
ALTER TABLE "lease_terminations"
  DROP CONSTRAINT IF EXISTS "lease_terminations_deposit_refund_id_fkey";

ALTER TABLE "lease_terminations"
  DROP CONSTRAINT IF EXISTS "lease_terminations_contract_id_fkey";

ALTER TABLE "lease_terminations"
  DROP CONSTRAINT IF EXISTS "lease_terminations_customer_id_fkey";

ALTER TABLE "lease_terminations"
  DROP CONSTRAINT IF EXISTS "lease_terminations_room_id_fkey";

ALTER TABLE "lease_terminations"
  DROP CONSTRAINT IF EXISTS "lease_terminations_created_by_fkey";

ALTER TABLE "lease_terminations"
  DROP CONSTRAINT IF EXISTS "lease_terminations_updated_by_fkey";

DROP TABLE IF EXISTS "lease_terminations";

-- 9) 菜单／权限：退租记录下线（若存在）
DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT "id" FROM "permissions" WHERE "module" = 'leaseTerminations'
);

DELETE FROM "permissions" WHERE "module" = 'leaseTerminations';

DELETE FROM "role_menus" WHERE "menu_id" = 'menu_lease_terminations';

DELETE FROM "menus" WHERE "id" = 'menu_lease_terminations' OR "route_name" = 'leaseTerminations';
