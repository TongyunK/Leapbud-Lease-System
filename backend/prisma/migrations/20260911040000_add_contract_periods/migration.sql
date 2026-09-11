-- AlterTable: 合约默认状态改为草稿
ALTER TABLE "contracts" ALTER COLUMN "status" SET DEFAULT '草稿';

COMMENT ON COLUMN "contracts"."lease_type" IS '租赁方式：整租 / 分租首用戶 / 分租次用戶';
COMMENT ON COLUMN "contracts"."status" IS '状态：草稿 / 簽約中 / 已簽約 / 交吉中 / 租賃中 / 已完成 / 退租中 / 已退租 / 已取消 / 已續約';
COMMENT ON COLUMN "contracts"."payment_cycle" IS '缴费周期：月繳 / 季繳 / 半年繳 / 年繳 等';
COMMENT ON COLUMN "contracts"."start_date" IS '合约开始日期（可由「使用期」汇总；列表筛选用）';
COMMENT ON COLUMN "contracts"."end_date" IS '合约到期日期（可由「使用期」汇总；列表筛选用）';

-- CreateTable
CREATE TABLE "contract_periods" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "date_type" TEXT NOT NULL,
    "date_unit" TEXT NOT NULL DEFAULT '月',
    "date_value" INTEGER NOT NULL DEFAULT 0,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_periods_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contract_periods_contract_id_idx" ON "contract_periods"("contract_id");
CREATE INDEX "contract_periods_date_type_idx" ON "contract_periods"("date_type");
CREATE INDEX "contract_periods_start_date_idx" ON "contract_periods"("start_date");
CREATE INDEX "contract_periods_end_date_idx" ON "contract_periods"("end_date");

ALTER TABLE "contract_periods" ADD CONSTRAINT "contract_periods_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON TABLE "contract_periods" IS '合约期（一条合约可有多段：使用期 / 必须使用期 / 免租期等）';
COMMENT ON COLUMN "contract_periods"."id" IS '主键';
COMMENT ON COLUMN "contract_periods"."contract_id" IS '所属合约 ID';
COMMENT ON COLUMN "contract_periods"."date_type" IS '日期类型：使用期 / 必須使用期 / 免租期';
COMMENT ON COLUMN "contract_periods"."date_unit" IS '日期单位：月 / 日';
COMMENT ON COLUMN "contract_periods"."date_value" IS '日期数值（与单位组合表示时长，如 12 月）';
COMMENT ON COLUMN "contract_periods"."start_date" IS '开始日期';
COMMENT ON COLUMN "contract_periods"."end_date" IS '结束日期';
COMMENT ON COLUMN "contract_periods"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "contract_periods"."created_at" IS '创建时间';
COMMENT ON COLUMN "contract_periods"."updated_at" IS '更新时间';
