-- CreateTable
CREATE TABLE "customer_requirements" (
    "id" TEXT NOT NULL,
    "requirement_code" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sales_manager" TEXT,
    "requirement_date" DATE,
    "status" TEXT NOT NULL DEFAULT '跟進中',
    "lease_duration" TEXT NOT NULL DEFAULT '',
    "budget" DECIMAL(14,2),
    "content" TEXT NOT NULL DEFAULT '',
    "remark" TEXT NOT NULL DEFAULT '',
    "attachment" TEXT NOT NULL DEFAULT '',
    "size_config_id" TEXT,
    "ac_config_id" TEXT,
    "window_config_id" TEXT,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_requirements_requirement_code_key" ON "customer_requirements"("requirement_code");

-- CreateIndex
CREATE INDEX "customer_requirements_customer_id_idx" ON "customer_requirements"("customer_id");

-- CreateIndex
CREATE INDEX "customer_requirements_sales_manager_idx" ON "customer_requirements"("sales_manager");

-- CreateIndex
CREATE INDEX "customer_requirements_status_idx" ON "customer_requirements"("status");

-- CreateIndex
CREATE INDEX "customer_requirements_requirement_date_idx" ON "customer_requirements"("requirement_date");

-- CreateIndex
CREATE INDEX "customer_requirements_size_config_id_idx" ON "customer_requirements"("size_config_id");

-- CreateIndex
CREATE INDEX "customer_requirements_ac_config_id_idx" ON "customer_requirements"("ac_config_id");

-- CreateIndex
CREATE INDEX "customer_requirements_window_config_id_idx" ON "customer_requirements"("window_config_id");

-- CreateIndex
CREATE INDEX "customer_requirements_created_by_idx" ON "customer_requirements"("created_by");

-- CreateIndex
CREATE INDEX "customer_requirements_updated_by_idx" ON "customer_requirements"("updated_by");

-- AddForeignKey
ALTER TABLE "customer_requirements" ADD CONSTRAINT "customer_requirements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_requirements" ADD CONSTRAINT "customer_requirements_sales_manager_fkey" FOREIGN KEY ("sales_manager") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_requirements" ADD CONSTRAINT "customer_requirements_size_config_id_fkey" FOREIGN KEY ("size_config_id") REFERENCES "room_config_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_requirements" ADD CONSTRAINT "customer_requirements_ac_config_id_fkey" FOREIGN KEY ("ac_config_id") REFERENCES "room_config_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_requirements" ADD CONSTRAINT "customer_requirements_window_config_id_fkey" FOREIGN KEY ("window_config_id") REFERENCES "room_config_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_requirements" ADD CONSTRAINT "customer_requirements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_requirements" ADD CONSTRAINT "customer_requirements_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "customer_requirements" IS '客户需求（咨询阶段的租房意向）';
COMMENT ON COLUMN "customer_requirements"."id" IS '主键';
COMMENT ON COLUMN "customer_requirements"."requirement_code" IS '需求编号（业务唯一，如 REQ2609100001）';
COMMENT ON COLUMN "customer_requirements"."customer_id" IS '所属客户 ID';
COMMENT ON COLUMN "customer_requirements"."sales_manager" IS '销售经理用户 ID';
COMMENT ON COLUMN "customer_requirements"."requirement_date" IS '创建日期（业务日期）';
COMMENT ON COLUMN "customer_requirements"."status" IS '状态：跟進中 / 已簽約 / 已取消';
COMMENT ON COLUMN "customer_requirements"."lease_duration" IS '租赁时长（文本，如 12个月）';
COMMENT ON COLUMN "customer_requirements"."budget" IS '预算';
COMMENT ON COLUMN "customer_requirements"."content" IS '需求内容';
COMMENT ON COLUMN "customer_requirements"."remark" IS '备注';
COMMENT ON COLUMN "customer_requirements"."attachment" IS '附件路径';
COMMENT ON COLUMN "customer_requirements"."size_config_id" IS '房间大小配置 ID（房间配置 size）';
COMMENT ON COLUMN "customer_requirements"."ac_config_id" IS '空调配置 ID（房间配置 ac）';
COMMENT ON COLUMN "customer_requirements"."window_config_id" IS '窗配置 ID（房间配置 window）';
COMMENT ON COLUMN "customer_requirements"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "customer_requirements"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "customer_requirements"."created_at" IS '创建时间';
COMMENT ON COLUMN "customer_requirements"."updated_at" IS '更新时间';

-- 菜单：客户需求（客户管理下）
INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES (
  'menu_customer_requirements',
  'menu_customer_mgmt',
  'menu',
  '客戶需求',
  'menu.customerRequirements',
  'customerRequirements',
  'customer-mgmt/requirements',
  'Document',
  23,
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

UPDATE "menus" SET "sort_order" = 24, "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'menu_customer_sources';

-- 授权：管理员与普通用户均可访问客户需求
INSERT INTO "role_menus" ("role_id", "menu_id", "created_at")
SELECT r."id", 'menu_customer_requirements', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."code" IN ('admin', 'user')
ON CONFLICT DO NOTHING;
