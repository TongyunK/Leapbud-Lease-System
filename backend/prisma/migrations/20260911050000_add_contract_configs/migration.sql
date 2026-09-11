-- CreateEnum
CREATE TYPE "ContractConfigType" AS ENUM ('periodType', 'leaseType', 'keyDeposit');

COMMENT ON TYPE "ContractConfigType" IS '合约配置字典类型：periodType=合约期类型，leaseType=租赁方式，keyDeposit=钥匙按金单价';

-- AlterTable: 合约钥匙数量
ALTER TABLE "contracts" ADD COLUMN "door_key_qty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "contracts" ADD COLUMN "mailbox_key_qty" INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN "contracts"."door_key_qty" IS '房门匙数量（押金 = 数量 × 配置单价）';
COMMENT ON COLUMN "contracts"."mailbox_key_qty" IS '智能卡信箱匙数量（押金 = 数量 × 配置单价）';
COMMENT ON COLUMN "contracts"."door_key_deposit" IS '房门匙按金金额（由数量 × 单价自动计算后落库）';
COMMENT ON COLUMN "contracts"."mailbox_key_deposit" IS '智能卡信箱匙按金金额（由数量 × 单价自动计算后落库）';

-- CreateTable
CREATE TABLE "contract_config_options" (
    "id" TEXT NOT NULL,
    "type" "ContractConfigType" NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL,
    "unit_price" DECIMAL(14,2),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_config_options_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_config_options_type_code_key" ON "contract_config_options"("type", "code");
CREATE INDEX "contract_config_options_type_active_sort_order_idx" ON "contract_config_options"("type", "active", "sort_order");
CREATE INDEX "contract_config_options_created_by_idx" ON "contract_config_options"("created_by");
CREATE INDEX "contract_config_options_updated_by_idx" ON "contract_config_options"("updated_by");

ALTER TABLE "contract_config_options" ADD CONSTRAINT "contract_config_options_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_config_options" ADD CONSTRAINT "contract_config_options_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "contract_config_options" IS '合约配置字典：合约期类型 / 租赁方式 / 钥匙按金单价';
COMMENT ON COLUMN "contract_config_options"."id" IS '主键';
COMMENT ON COLUMN "contract_config_options"."type" IS '配置类型：periodType / leaseType / keyDeposit';
COMMENT ON COLUMN "contract_config_options"."code" IS '稳定业务码（同 type 下唯一；如 usage / door_key）';
COMMENT ON COLUMN "contract_config_options"."label" IS '展示名称（写入合约时的文案快照）';
COMMENT ON COLUMN "contract_config_options"."unit_price" IS '单价（仅 keyDeposit；其它类型为 null）';
COMMENT ON COLUMN "contract_config_options"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "contract_config_options"."active" IS '是否启用（停用后表单不下拉展示）';
COMMENT ON COLUMN "contract_config_options"."created_by" IS '创建人';
COMMENT ON COLUMN "contract_config_options"."updated_by" IS '更新人';
COMMENT ON COLUMN "contract_config_options"."created_at" IS '创建时间';
COMMENT ON COLUMN "contract_config_options"."updated_at" IS '更新时间';

-- Seed defaults
INSERT INTO "contract_config_options" ("id", "type", "code", "label", "unit_price", "sort_order", "active", "created_at", "updated_at") VALUES
  ('ccfg_period_usage', 'periodType', 'usage', '使用期', NULL, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccfg_period_mandatory', 'periodType', 'mandatory', '必須使用期', NULL, 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccfg_period_rent_free', 'periodType', 'rent_free', '免租期', NULL, 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccfg_lease_whole', 'leaseType', 'whole', '整租', NULL, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccfg_lease_sub_primary', 'leaseType', 'sub_primary', '分租首用戶', NULL, 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccfg_lease_sub_secondary', 'leaseType', 'sub_secondary', '分租次用戶', NULL, 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccfg_key_door', 'keyDeposit', 'door_key', '房門匙', 50, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccfg_key_mailbox', 'keyDeposit', 'mailbox_key', '智能卡信箱匙', 50, 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Menu: 合約配置（admin only）
INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES (
  'menu_contract_configs',
  'menu_contract_mgmt',
  'menu',
  '合約配置',
  'menu.contractConfigs',
  'contractConfigs',
  'contract-mgmt/contract-configs',
  'Setting',
  27,
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
SELECT r."id", 'menu_contract_configs', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."code" = 'admin'
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
