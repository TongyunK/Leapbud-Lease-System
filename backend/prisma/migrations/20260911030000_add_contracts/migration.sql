-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "contract_code" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sales_manager" TEXT,
    "requirement_id" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "actual_end_date" DATE,
    "lease_type" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '簽約中',
    "room_deposit" DECIMAL(14,2),
    "monthly_rent" DECIMAL(14,2),
    "booking_deposit" DECIMAL(14,2),
    "payment_cycle" TEXT NOT NULL DEFAULT '',
    "electricity_rate" DECIMAL(14,4),
    "misc_deposit" DECIMAL(14,2),
    "door_key_deposit" DECIMAL(14,2),
    "mailbox_key_deposit" DECIMAL(14,2),
    "room_name_text" TEXT NOT NULL DEFAULT '',
    "sublease_mark" TEXT NOT NULL DEFAULT '',
    "attachment" TEXT NOT NULL DEFAULT '',
    "remark" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contracts_contract_code_key" ON "contracts"("contract_code");
CREATE INDEX "contracts_room_id_idx" ON "contracts"("room_id");
CREATE INDEX "contracts_customer_id_idx" ON "contracts"("customer_id");
CREATE INDEX "contracts_sales_manager_idx" ON "contracts"("sales_manager");
CREATE INDEX "contracts_requirement_id_idx" ON "contracts"("requirement_id");
CREATE INDEX "contracts_status_idx" ON "contracts"("status");
CREATE INDEX "contracts_start_date_idx" ON "contracts"("start_date");
CREATE INDEX "contracts_end_date_idx" ON "contracts"("end_date");
CREATE INDEX "contracts_created_by_idx" ON "contracts"("created_by");
CREATE INDEX "contracts_updated_by_idx" ON "contracts"("updated_by");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_sales_manager_fkey" FOREIGN KEY ("sales_manager") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "customer_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "contracts" IS '租赁合约（房间与客户的签约主体）';
COMMENT ON COLUMN "contracts"."id" IS '主键';
COMMENT ON COLUMN "contracts"."contract_code" IS '合约编号（业务唯一，如 CTR2609110001）';
COMMENT ON COLUMN "contracts"."room_id" IS '所属房间 ID';
COMMENT ON COLUMN "contracts"."customer_id" IS '所属客户 ID';
COMMENT ON COLUMN "contracts"."sales_manager" IS '销售经理用户 ID';
COMMENT ON COLUMN "contracts"."requirement_id" IS '关联客户需求 ID';
COMMENT ON COLUMN "contracts"."start_date" IS '合约开始日期';
COMMENT ON COLUMN "contracts"."end_date" IS '合约到期日期';
COMMENT ON COLUMN "contracts"."actual_end_date" IS '实际退租日期';
COMMENT ON COLUMN "contracts"."lease_type" IS '租赁方式（如 月租 / 日租 / 時租）';
COMMENT ON COLUMN "contracts"."status" IS '状态：簽約中 / 租賃中 / 退租中 / 已退租 / 已取消';
COMMENT ON COLUMN "contracts"."room_deposit" IS '房间按金';
COMMENT ON COLUMN "contracts"."monthly_rent" IS '租金/月';
COMMENT ON COLUMN "contracts"."booking_deposit" IS '订金';
COMMENT ON COLUMN "contracts"."payment_cycle" IS '缴费周期（如 每月 / 每季）';
COMMENT ON COLUMN "contracts"."electricity_rate" IS '电费/度';
COMMENT ON COLUMN "contracts"."misc_deposit" IS '杂项按金';
COMMENT ON COLUMN "contracts"."door_key_deposit" IS '房门匙数量按金';
COMMENT ON COLUMN "contracts"."mailbox_key_deposit" IS '信箱匙数量按金';
COMMENT ON COLUMN "contracts"."room_name_text" IS '房间名称文本（冗余展示，可与房间名称同步）';
COMMENT ON COLUMN "contracts"."sublease_mark" IS '分租符号';
COMMENT ON COLUMN "contracts"."attachment" IS '客户签约附件路径';
COMMENT ON COLUMN "contracts"."remark" IS '备注';
COMMENT ON COLUMN "contracts"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "contracts"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "contracts"."created_at" IS '创建时间';
COMMENT ON COLUMN "contracts"."updated_at" IS '更新时间';

-- 菜单：合约管理目录 + 合约信息
INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon", "sort_order", "active", "created_at", "updated_at"
) VALUES (
  'menu_contract_mgmt',
  NULL,
  'directory',
  '合約管理',
  'menu.contractMgmt',
  '',
  '',
  'Notebook',
  25,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "name_key" = EXCLUDED."name_key",
  "route_name" = EXCLUDED."route_name",
  "path" = EXCLUDED."path",
  "icon" = EXCLUDED."icon",
  "sort_order" = EXCLUDED."sort_order",
  "active" = EXCLUDED."active",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon", "sort_order", "active", "created_at", "updated_at"
) VALUES (
  'menu_contracts',
  'menu_contract_mgmt',
  'menu',
  '合約信息',
  'menu.contracts',
  'contracts',
  'contract-mgmt/contracts',
  'Document',
  26,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
  "type" = EXCLUDED."type",
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
CROSS JOIN (VALUES ('menu_contract_mgmt'), ('menu_contracts')) AS m("id")
WHERE r."code" IN ('admin', 'user')
ON CONFLICT DO NOTHING;
