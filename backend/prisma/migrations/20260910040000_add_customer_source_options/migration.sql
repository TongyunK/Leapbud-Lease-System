-- 客户来源字典表
CREATE TABLE "customer_source_options" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_source_options_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_source_options_label_key" ON "customer_source_options"("label");
CREATE INDEX "customer_source_options_active_sort_order_idx" ON "customer_source_options"("active", "sort_order");
CREATE INDEX "customer_source_options_created_by_idx" ON "customer_source_options"("created_by");
CREATE INDEX "customer_source_options_updated_by_idx" ON "customer_source_options"("updated_by");

ALTER TABLE "customer_source_options"
  ADD CONSTRAINT "customer_source_options_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_source_options"
  ADD CONSTRAINT "customer_source_options_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "customer_source_options" IS '客户来源字典（Agent / Call in 等，可后台维护）';
COMMENT ON COLUMN "customer_source_options"."id" IS '主键';
COMMENT ON COLUMN "customer_source_options"."label" IS '来源名称（业务唯一，写入客户 source）';
COMMENT ON COLUMN "customer_source_options"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "customer_source_options"."active" IS '是否启用';
COMMENT ON COLUMN "customer_source_options"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "customer_source_options"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "customer_source_options"."created_at" IS '创建时间';
COMMENT ON COLUMN "customer_source_options"."updated_at" IS '更新时间';

-- 初始选项（与业务现用列表一致）
INSERT INTO "customer_source_options" ("id", "label", "sort_order", "active", "created_at", "updated_at")
VALUES
  ('csrc_tenant_intro', '其他租客介紹', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('csrc_multi_acct', '同一客戶多賬號', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('csrc_whatsapp', 'Whatsapp', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('csrc_outlook', 'Outlook', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('csrc_call_in', 'Call in', 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('csrc_agent', 'Agent', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("label") DO NOTHING;
