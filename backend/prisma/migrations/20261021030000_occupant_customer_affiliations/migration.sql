-- 使用者与客户的归属历史（换绑可追溯；当前所属仍以 occupants.customer_id 为准）
CREATE TABLE "occupant_customer_affiliations" (
    "id" TEXT NOT NULL,
    "occupant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_by" TEXT,
    "ended_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occupant_customer_affiliations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "occupant_customer_affiliations_occupant_id_ended_at_idx" ON "occupant_customer_affiliations"("occupant_id", "ended_at");
CREATE INDEX "occupant_customer_affiliations_customer_id_ended_at_idx" ON "occupant_customer_affiliations"("customer_id", "ended_at");
CREATE INDEX "occupant_customer_affiliations_created_by_idx" ON "occupant_customer_affiliations"("created_by");
CREATE INDEX "occupant_customer_affiliations_ended_by_idx" ON "occupant_customer_affiliations"("ended_by");

ALTER TABLE "occupant_customer_affiliations" ADD CONSTRAINT "occupant_customer_affiliations_occupant_id_fkey" FOREIGN KEY ("occupant_id") REFERENCES "occupants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "occupant_customer_affiliations" ADD CONSTRAINT "occupant_customer_affiliations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "occupant_customer_affiliations" ADD CONSTRAINT "occupant_customer_affiliations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "occupant_customer_affiliations" ADD CONSTRAINT "occupant_customer_affiliations_ended_by_fkey" FOREIGN KEY ("ended_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "occupant_customer_affiliations" IS '使用者与客户的归属历史（当前所属仍以 occupants.customer_id 为准；换绑时结束旧记录并开启新记录）';
COMMENT ON COLUMN "occupant_customer_affiliations"."id" IS '主键';
COMMENT ON COLUMN "occupant_customer_affiliations"."occupant_id" IS '所属使用者 ID';
COMMENT ON COLUMN "occupant_customer_affiliations"."customer_id" IS '所属客户 ID';
COMMENT ON COLUMN "occupant_customer_affiliations"."started_at" IS '开始归属时间';
COMMENT ON COLUMN "occupant_customer_affiliations"."ended_at" IS '结束归属时间（空表示当前仍归属该客户）';
COMMENT ON COLUMN "occupant_customer_affiliations"."created_by" IS '创建人（开启归属）用户 ID';
COMMENT ON COLUMN "occupant_customer_affiliations"."ended_by" IS '结束人（换绑/解除）用户 ID';
COMMENT ON COLUMN "occupant_customer_affiliations"."created_at" IS '创建时间';

-- 回填：现有「当前所属」写入一条未结束的归属记录
INSERT INTO "occupant_customer_affiliations" ("id", "occupant_id", "customer_id", "started_at", "ended_at", "created_at")
SELECT
  'aff_' || o."id",
  o."id",
  o."customer_id",
  o."created_at",
  NULL,
  CURRENT_TIMESTAMP
FROM "occupants" o
WHERE o."customer_id" IS NOT NULL;
