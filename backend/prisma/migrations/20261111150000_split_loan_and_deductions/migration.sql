-- 借出与按金扣除拆分：loan_items + 扩展 settlement_items → 回填 → 删 other_fees

-- 1) 借出物品表
CREATE TABLE IF NOT EXISTS "contract_loan_items" (
  "id" TEXT NOT NULL,
  "legacy_id" TEXT,
  "contract_id" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "unit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "remark" TEXT NOT NULL DEFAULT '',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contract_loan_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "contract_loan_items_legacy_id_key" ON "contract_loan_items"("legacy_id");
CREATE INDEX IF NOT EXISTS "contract_loan_items_contract_id_idx" ON "contract_loan_items"("contract_id");
CREATE INDEX IF NOT EXISTS "contract_loan_items_created_by_idx" ON "contract_loan_items"("created_by");
CREATE INDEX IF NOT EXISTS "contract_loan_items_updated_by_idx" ON "contract_loan_items"("updated_by");

ALTER TABLE "contract_loan_items"
  ADD CONSTRAINT "contract_loan_items_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_loan_items"
  ADD CONSTRAINT "contract_loan_items_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_loan_items"
  ADD CONSTRAINT "contract_loan_items_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "contract_loan_items" IS '合约借出物品（签约时登记；与结算扣款明细分离）';
COMMENT ON COLUMN "contract_loan_items"."id" IS '主键';
COMMENT ON COLUMN "contract_loan_items"."legacy_id" IS '旧系统记录 ID（简道云 _id；工程师 JSON 导入用；亦兼容从 other_fees 迁入时保留原 id）';
COMMENT ON COLUMN "contract_loan_items"."contract_id" IS '所属合约 ID';
COMMENT ON COLUMN "contract_loan_items"."description" IS '描述（物品名称）';
COMMENT ON COLUMN "contract_loan_items"."quantity" IS '数量';
COMMENT ON COLUMN "contract_loan_items"."unit_amount" IS '按金（单价）';
COMMENT ON COLUMN "contract_loan_items"."subtotal" IS '小计（通常 = 数量 × 按金）';
COMMENT ON COLUMN "contract_loan_items"."remark" IS '备注';
COMMENT ON COLUMN "contract_loan_items"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "contract_loan_items"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "contract_loan_items"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "contract_loan_items"."created_at" IS '创建时间';
COMMENT ON COLUMN "contract_loan_items"."updated_at" IS '更新时间';

-- 2) 结算明细扩展列
ALTER TABLE "contract_settlement_items"
  ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "return_status" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "source_loan_item_id" TEXT;

CREATE INDEX IF NOT EXISTS "contract_settlement_items_source_loan_item_id_idx"
  ON "contract_settlement_items"("source_loan_item_id");

COMMENT ON COLUMN "contract_settlement_items"."quantity" IS '数量（扣款明细；钥匙少还等）';
COMMENT ON COLUMN "contract_settlement_items"."unit_amount" IS '单价（扣款明细）';
COMMENT ON COLUMN "contract_settlement_items"."return_status" IS '退租验收状态：damaged=损坏扣除，missing=未归还扣除；非验收行为空';
COMMENT ON COLUMN "contract_settlement_items"."source_loan_item_id" IS '来源借出物品 ID（扣款可追溯原借出行）';

-- 3) 迁入借出：settlement_id IS NULL（保留原 id，便于 source_loan_fee_id 映射）
INSERT INTO "contract_loan_items" (
  "id", "legacy_id", "contract_id", "description", "quantity", "unit_amount",
  "subtotal", "remark", "sort_order", "created_by", "updated_by", "created_at", "updated_at"
)
SELECT
  ofee."id",
  ofee."legacy_id",
  ofee."contract_id",
  COALESCE(ofee."description", ''),
  COALESCE(ofee."quantity", 0),
  COALESCE(ofee."unit_amount", 0),
  COALESCE(ofee."subtotal", 0),
  COALESCE(ofee."remark", ''),
  COALESCE(ofee."sort_order", 0),
  ofee."created_by",
  ofee."updated_by",
  ofee."created_at",
  ofee."updated_at"
FROM "contract_other_fees" AS ofee
WHERE ofee."settlement_id" IS NULL
ON CONFLICT ("id") DO NOTHING;

-- 4) 已有结算明细：从 other_fee 回填 qty/unit/return_status/source_loan
UPDATE "contract_settlement_items" AS si
SET
  "quantity" = COALESCE(ofee."quantity", 0),
  "unit_amount" = COALESCE(ofee."unit_amount", 0),
  "return_status" = CASE
    WHEN COALESCE(si."return_status", '') <> '' THEN si."return_status"
    WHEN COALESCE(ofee."return_status", '') IN ('damaged', 'missing') THEN ofee."return_status"
    WHEN COALESCE(si."remark", '') IN ('damaged', 'missing') THEN si."remark"
    ELSE COALESCE(ofee."return_status", '')
  END,
  "source_loan_item_id" = CASE
    WHEN ofee."source_loan_fee_id" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "contract_loan_items" li WHERE li."id" = ofee."source_loan_fee_id")
    THEN ofee."source_loan_fee_id"
    ELSE si."source_loan_item_id"
  END
FROM "contract_other_fees" AS ofee
WHERE si."other_fee_id" = ofee."id";

-- 5) 有结算但无明细的扣除 other_fee → 补建结算明细
INSERT INTO "contract_settlement_items" (
  "id",
  "settlement_id",
  "item_type",
  "description",
  "amount",
  "quantity",
  "unit_amount",
  "return_status",
  "source_loan_item_id",
  "sort_order",
  "remark",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at"
)
SELECT
  'mig_si_' || ofee."id",
  ofee."settlement_id",
  CASE
    WHEN ofee."return_status" = 'damaged' THEN 'DAMAGE_DEDUCTION'::"ContractSettlementItemType"
    ELSE 'PENALTY_DEDUCTION'::"ContractSettlementItemType"
  END,
  COALESCE(ofee."description", ''),
  COALESCE(ofee."subtotal", 0),
  COALESCE(ofee."quantity", 0),
  COALESCE(ofee."unit_amount", 0),
  CASE
    WHEN ofee."return_status" IN ('damaged', 'missing') THEN ofee."return_status"
    ELSE ''
  END,
  CASE
    WHEN ofee."source_loan_fee_id" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "contract_loan_items" li WHERE li."id" = ofee."source_loan_fee_id")
    THEN ofee."source_loan_fee_id"
    ELSE NULL
  END,
  COALESCE(ofee."sort_order", 0),
  COALESCE(ofee."remark", ''),
  ofee."created_by",
  ofee."updated_by",
  ofee."created_at",
  ofee."updated_at"
FROM "contract_other_fees" AS ofee
WHERE ofee."settlement_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "contract_settlement_items" si WHERE si."other_fee_id" = ofee."id"
  )
ON CONFLICT ("id") DO NOTHING;

-- 6) 挂 source_loan_item FK；去掉 other_fee_id
ALTER TABLE "contract_settlement_items"
  DROP CONSTRAINT IF EXISTS "contract_settlement_items_other_fee_id_fkey";

DROP INDEX IF EXISTS "contract_settlement_items_other_fee_id_idx";

ALTER TABLE "contract_settlement_items"
  DROP COLUMN IF EXISTS "other_fee_id";

ALTER TABLE "contract_settlement_items"
  ADD CONSTRAINT "contract_settlement_items_source_loan_item_id_fkey"
  FOREIGN KEY ("source_loan_item_id") REFERENCES "contract_loan_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7) 删除 other_fees
ALTER TABLE "contract_other_fees"
  DROP CONSTRAINT IF EXISTS "contract_other_fees_settlement_id_fkey";

ALTER TABLE "contract_other_fees"
  DROP CONSTRAINT IF EXISTS "contract_other_fees_contract_id_fkey";

ALTER TABLE "contract_other_fees"
  DROP CONSTRAINT IF EXISTS "contract_other_fees_created_by_fkey";

ALTER TABLE "contract_other_fees"
  DROP CONSTRAINT IF EXISTS "contract_other_fees_updated_by_fkey";

DROP TABLE IF EXISTS "contract_other_fees";

-- 8) 菜单／权限：其他费用 → 借出物品（新权限可能已由 catalog sync 写入，勿 rename 撞唯一键）
UPDATE "menus"
SET
  "name" = '借出物品',
  "name_en" = 'Loan items',
  "name_key" = 'menu.contractLoanItems',
  "route_name" = 'contractLoanItems',
  "path" = 'contract-mgmt/contract-loan-items',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'menu_contract_other_fees' OR "route_name" = 'contractOtherFees';

DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT "id" FROM "permissions" WHERE "module" = 'contractOtherFees'
);

DELETE FROM "permissions" WHERE "module" = 'contractOtherFees';
