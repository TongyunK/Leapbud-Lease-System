-- CreateTable: 退租记录
CREATE TABLE "lease_terminations" (
    "id" TEXT NOT NULL,
    "termination_code" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "termination_date" DATE,
    "notice_attachment" TEXT NOT NULL DEFAULT '',
    "door_key_returned_qty" INTEGER NOT NULL DEFAULT 0,
    "smart_card_returned_qty" INTEGER NOT NULL DEFAULT 0,
    "site_condition" TEXT NOT NULL DEFAULT '',
    "remark" TEXT NOT NULL DEFAULT '',
    "related_deposit_refund" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_terminations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lease_terminations_termination_code_key" ON "lease_terminations"("termination_code");
CREATE INDEX "lease_terminations_contract_id_idx" ON "lease_terminations"("contract_id");
CREATE INDEX "lease_terminations_customer_id_idx" ON "lease_terminations"("customer_id");
CREATE INDEX "lease_terminations_room_id_idx" ON "lease_terminations"("room_id");
CREATE INDEX "lease_terminations_termination_date_idx" ON "lease_terminations"("termination_date");
CREATE INDEX "lease_terminations_created_by_idx" ON "lease_terminations"("created_by");
CREATE INDEX "lease_terminations_updated_by_idx" ON "lease_terminations"("updated_by");

ALTER TABLE "lease_terminations" ADD CONSTRAINT "lease_terminations_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lease_terminations" ADD CONSTRAINT "lease_terminations_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lease_terminations" ADD CONSTRAINT "lease_terminations_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lease_terminations" ADD CONSTRAINT "lease_terminations_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lease_terminations" ADD CONSTRAINT "lease_terminations_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "lease_terminations" IS '退租记录（合约退租办理单）';
COMMENT ON COLUMN "lease_terminations"."id" IS '主键';
COMMENT ON COLUMN "lease_terminations"."termination_code" IS '退租编号（业务唯一，如 TRM2609110001）';
COMMENT ON COLUMN "lease_terminations"."contract_id" IS '所属合约 ID';
COMMENT ON COLUMN "lease_terminations"."customer_id" IS '所属客户 ID（通常与合约客户一致，可冗余便于筛选）';
COMMENT ON COLUMN "lease_terminations"."room_id" IS '所属房间 ID（通常与合约房间一致）';
COMMENT ON COLUMN "lease_terminations"."reason" IS '退租原因';
COMMENT ON COLUMN "lease_terminations"."termination_date" IS '退租日期';
COMMENT ON COLUMN "lease_terminations"."notice_attachment" IS '客户书面通知附件路径';
COMMENT ON COLUMN "lease_terminations"."door_key_returned_qty" IS '房门匙已回收数量';
COMMENT ON COLUMN "lease_terminations"."smart_card_returned_qty" IS '智能卡（信箱匙）已回收数量';
COMMENT ON COLUMN "lease_terminations"."site_condition" IS '现场情况';
COMMENT ON COLUMN "lease_terminations"."remark" IS '备注';
COMMENT ON COLUMN "lease_terminations"."related_deposit_refund" IS '关联退按金单编号/引用（退按金模块未落地前以文本保存）';
COMMENT ON COLUMN "lease_terminations"."created_by" IS '创建人';
COMMENT ON COLUMN "lease_terminations"."updated_by" IS '更新人';
COMMENT ON COLUMN "lease_terminations"."created_at" IS '创建时间';
COMMENT ON COLUMN "lease_terminations"."updated_at" IS '更新时间';

-- CreateTable: 合约其他费用项
CREATE TABLE "contract_other_fees" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "termination_id" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remark" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_other_fees_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contract_other_fees_contract_id_idx" ON "contract_other_fees"("contract_id");
CREATE INDEX "contract_other_fees_termination_id_idx" ON "contract_other_fees"("termination_id");
CREATE INDEX "contract_other_fees_created_by_idx" ON "contract_other_fees"("created_by");
CREATE INDEX "contract_other_fees_updated_by_idx" ON "contract_other_fees"("updated_by");

ALTER TABLE "contract_other_fees" ADD CONSTRAINT "contract_other_fees_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_other_fees" ADD CONSTRAINT "contract_other_fees_termination_id_fkey"
  FOREIGN KEY ("termination_id") REFERENCES "lease_terminations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_other_fees" ADD CONSTRAINT "contract_other_fees_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_other_fees" ADD CONSTRAINT "contract_other_fees_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "contract_other_fees" IS '合约其他费用项（含退租按金扣除事项）';
COMMENT ON COLUMN "contract_other_fees"."id" IS '主键';
COMMENT ON COLUMN "contract_other_fees"."contract_id" IS '所属合约 ID';
COMMENT ON COLUMN "contract_other_fees"."termination_id" IS '所属退租记录 ID（可选；退租按金扣除时填写）';
COMMENT ON COLUMN "contract_other_fees"."description" IS '描述';
COMMENT ON COLUMN "contract_other_fees"."quantity" IS '数量';
COMMENT ON COLUMN "contract_other_fees"."unit_amount" IS '按金（单价）';
COMMENT ON COLUMN "contract_other_fees"."subtotal" IS '小计（通常 = 数量 × 按金）';
COMMENT ON COLUMN "contract_other_fees"."remark" IS '备注';
COMMENT ON COLUMN "contract_other_fees"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "contract_other_fees"."created_by" IS '创建人';
COMMENT ON COLUMN "contract_other_fees"."updated_by" IS '更新人';
COMMENT ON COLUMN "contract_other_fees"."created_at" IS '创建时间';
COMMENT ON COLUMN "contract_other_fees"."updated_at" IS '更新时间';

-- Menus
INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES
(
  'menu_lease_terminations',
  'menu_contract_mgmt',
  'menu',
  '退租记录',
  'menu.leaseTerminations',
  'leaseTerminations',
  'contract-mgmt/lease-terminations',
  'DocumentDelete',
  29,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'menu_contract_other_fees',
  'menu_contract_mgmt',
  'menu',
  '其他费用项',
  'menu.contractOtherFees',
  'contractOtherFees',
  'contract-mgmt/contract-other-fees',
  'Ticket',
  30,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
  "name" = EXCLUDED."name",
  "name_key" = EXCLUDED."name_key",
  "route_name" = EXCLUDED."route_name",
  "path" = EXCLUDED."path",
  "icon" = EXCLUDED."icon",
  "sort_order" = EXCLUDED."sort_order",
  "active" = EXCLUDED."active",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "role_menus" ("role_id", "menu_id", "created_at")
SELECT r."id", m."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN (VALUES ('menu_lease_terminations'), ('menu_contract_other_fees')) AS m("id")
WHERE r."code" IN ('admin', 'user')
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
