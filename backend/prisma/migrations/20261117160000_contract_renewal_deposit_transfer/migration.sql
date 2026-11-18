-- 续约链 + 按金／定金迁移台账；定金动账增加 transfer_out / transfer_in

ALTER TYPE "BookingDepositMovementType" ADD VALUE IF NOT EXISTS 'transfer_out';
ALTER TYPE "BookingDepositMovementType" ADD VALUE IF NOT EXISTS 'transfer_in';

ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "renewed_from_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "contracts_renewed_from_id_key" ON "contracts"("renewed_from_id");

ALTER TABLE "contracts"
  DROP CONSTRAINT IF EXISTS "contracts_renewed_from_id_fkey";
ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_renewed_from_id_fkey"
  FOREIGN KEY ("renewed_from_id") REFERENCES "contracts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON COLUMN "contracts"."renewed_from_id" IS '续约来源合约 ID（本约为续约新开时指向旧约；每旧约至多续一次）';

ALTER TABLE "booking_deposit_movements"
  ADD COLUMN IF NOT EXISTS "related_contract_id" TEXT,
  ADD COLUMN IF NOT EXISTS "transfer_group_id" TEXT;

CREATE INDEX IF NOT EXISTS "booking_deposit_movements_related_contract_id_idx"
  ON "booking_deposit_movements"("related_contract_id");
CREATE INDEX IF NOT EXISTS "booking_deposit_movements_transfer_group_id_idx"
  ON "booking_deposit_movements"("transfer_group_id");

COMMENT ON COLUMN "booking_deposit_movements"."related_contract_id" IS '续约对端合约 ID（transfer_out／transfer_in）';
COMMENT ON COLUMN "booking_deposit_movements"."transfer_group_id" IS '迁移批次号（同一续约的 out/in 共用）';

CREATE TABLE IF NOT EXISTS "contract_deposit_transfers" (
  "id" TEXT NOT NULL,
  "from_contract_id" TEXT NOT NULL,
  "to_contract_id" TEXT NOT NULL,
  "transfer_date" DATE NOT NULL,
  "room_deposit_transferred" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "room_deposit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "misc_deposit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "door_key_deposit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "mailbox_key_deposit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "loan_items_deposit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "booking_deposit_transferred" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "remark" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contract_deposit_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contract_deposit_transfers_from_contract_id_idx"
  ON "contract_deposit_transfers"("from_contract_id");
CREATE INDEX IF NOT EXISTS "contract_deposit_transfers_to_contract_id_idx"
  ON "contract_deposit_transfers"("to_contract_id");
CREATE INDEX IF NOT EXISTS "contract_deposit_transfers_transfer_date_idx"
  ON "contract_deposit_transfers"("transfer_date");
CREATE INDEX IF NOT EXISTS "contract_deposit_transfers_created_by_idx"
  ON "contract_deposit_transfers"("created_by");
CREATE INDEX IF NOT EXISTS "contract_deposit_transfers_updated_by_idx"
  ON "contract_deposit_transfers"("updated_by");

ALTER TABLE "contract_deposit_transfers"
  DROP CONSTRAINT IF EXISTS "contract_deposit_transfers_from_contract_id_fkey";
ALTER TABLE "contract_deposit_transfers"
  ADD CONSTRAINT "contract_deposit_transfers_from_contract_id_fkey"
  FOREIGN KEY ("from_contract_id") REFERENCES "contracts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contract_deposit_transfers"
  DROP CONSTRAINT IF EXISTS "contract_deposit_transfers_to_contract_id_fkey";
ALTER TABLE "contract_deposit_transfers"
  ADD CONSTRAINT "contract_deposit_transfers_to_contract_id_fkey"
  FOREIGN KEY ("to_contract_id") REFERENCES "contracts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contract_deposit_transfers"
  DROP CONSTRAINT IF EXISTS "contract_deposit_transfers_created_by_fkey";
ALTER TABLE "contract_deposit_transfers"
  ADD CONSTRAINT "contract_deposit_transfers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_deposit_transfers"
  DROP CONSTRAINT IF EXISTS "contract_deposit_transfers_updated_by_fkey";
ALTER TABLE "contract_deposit_transfers"
  ADD CONSTRAINT "contract_deposit_transfers_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "contract_deposit_transfers" IS '续约按金／定金迁移（不伪造资金流水；退租时认迁入按金）';
COMMENT ON COLUMN "contract_deposit_transfers"."from_contract_id" IS '迁出合约 ID（旧约）';
COMMENT ON COLUMN "contract_deposit_transfers"."to_contract_id" IS '迁入合约 ID（新约）';
COMMENT ON COLUMN "contract_deposit_transfers"."transfer_date" IS '迁移日期';
COMMENT ON COLUMN "contract_deposit_transfers"."room_deposit_transferred" IS '已收按金迁入合计（房间+杂项+钥匙+借出物品）';
COMMENT ON COLUMN "contract_deposit_transfers"."room_deposit_amount" IS '房间按金部分';
COMMENT ON COLUMN "contract_deposit_transfers"."misc_deposit_amount" IS '杂项按金部分';
COMMENT ON COLUMN "contract_deposit_transfers"."door_key_deposit_amount" IS '房门匙按金部分';
COMMENT ON COLUMN "contract_deposit_transfers"."mailbox_key_deposit_amount" IS '信箱匙按金部分';
COMMENT ON COLUMN "contract_deposit_transfers"."loan_items_deposit_amount" IS '借出物品按金部分';
COMMENT ON COLUMN "contract_deposit_transfers"."booking_deposit_transferred" IS '定金可用余额迁入';
COMMENT ON COLUMN "contract_deposit_transfers"."remark" IS '备注';
COMMENT ON COLUMN "contract_deposit_transfers"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "contract_deposit_transfers"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "contract_deposit_transfers"."created_at" IS '创建时间';
COMMENT ON COLUMN "contract_deposit_transfers"."updated_at" IS '更新时间';
