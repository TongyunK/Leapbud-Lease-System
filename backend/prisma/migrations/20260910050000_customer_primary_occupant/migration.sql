-- 客户主要使用者外键 + 去掉客户表冗余联络字段

-- 1) 无使用者但有联络信息的客户：先补一条使用者
INSERT INTO "occupants" (
  "id", "name", "customer_id", "customer_code", "related_customer_name",
  "whatsapp", "mobile_phone", "contact_phone", "email", "fax", "address",
  "id_card_no", "id_card_image", "address_proof_copy", "remark",
  "created_at", "updated_at"
)
SELECT
  'mig_occ_' || c."id",
  COALESCE(NULLIF(TRIM(c."primary_contact"), ''), NULLIF(TRIM(c."user_name"), ''), c."name"),
  c."id",
  c."customer_code",
  c."name",
  c."whatsapp",
  c."mobile_phone",
  c."contact_phone",
  c."email",
  c."fax",
  c."address",
  c."id_card_no",
  c."id_card_image",
  c."address_proof_copy",
  '',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "customers" c
WHERE NOT EXISTS (
  SELECT 1 FROM "occupants" o WHERE o."customer_id" = c."id"
)
AND (
  NULLIF(TRIM(c."primary_contact"), '') IS NOT NULL
  OR NULLIF(TRIM(c."user_name"), '') IS NOT NULL
  OR NULLIF(TRIM(c."mobile_phone"), '') IS NOT NULL
  OR NULLIF(TRIM(c."whatsapp"), '') IS NOT NULL
  OR NULLIF(TRIM(c."email"), '') IS NOT NULL
);

-- 2) 新增主要使用者列
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "primary_occupant_id" TEXT;

-- 3) 回填：优先匹配主要联络人姓名
UPDATE "customers" c
SET "primary_occupant_id" = sub."id"
FROM (
  SELECT DISTINCT ON (o."customer_id") o."id", o."customer_id"
  FROM "occupants" o
  INNER JOIN "customers" c2
    ON c2."id" = o."customer_id"
   AND NULLIF(TRIM(c2."primary_contact"), '') IS NOT NULL
   AND o."name" = c2."primary_contact"
  ORDER BY o."customer_id", o."updated_at" DESC
) sub
WHERE c."id" = sub."customer_id"
  AND c."primary_occupant_id" IS NULL;

-- 4) 回填：匹配使用者姓名
UPDATE "customers" c
SET "primary_occupant_id" = sub."id"
FROM (
  SELECT DISTINCT ON (o."customer_id") o."id", o."customer_id"
  FROM "occupants" o
  INNER JOIN "customers" c2
    ON c2."id" = o."customer_id"
   AND NULLIF(TRIM(c2."user_name"), '') IS NOT NULL
   AND o."name" = c2."user_name"
  ORDER BY o."customer_id", o."updated_at" DESC
) sub
WHERE c."id" = sub."customer_id"
  AND c."primary_occupant_id" IS NULL;

-- 5) 回填：任意一名关联使用者
UPDATE "customers" c
SET "primary_occupant_id" = sub."id"
FROM (
  SELECT DISTINCT ON ("customer_id") "id", "customer_id"
  FROM "occupants"
  WHERE "customer_id" IS NOT NULL
  ORDER BY "customer_id", "updated_at" DESC
) sub
WHERE c."id" = sub."customer_id"
  AND c."primary_occupant_id" IS NULL;

CREATE INDEX IF NOT EXISTS "customers_primary_occupant_id_idx" ON "customers"("primary_occupant_id");

ALTER TABLE "customers"
  DROP CONSTRAINT IF EXISTS "customers_primary_occupant_id_fkey";

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_primary_occupant_id_fkey"
  FOREIGN KEY ("primary_occupant_id") REFERENCES "occupants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON COLUMN "customers"."primary_occupant_id" IS '主要使用者（联络人）ID';

-- 6) 删除客户表冗余联络字段
ALTER TABLE "customers" DROP COLUMN IF EXISTS "user_name";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "primary_contact";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "whatsapp";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "mobile_phone";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "contact_phone";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "email";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "fax";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "address";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "id_card_no";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "id_card_image";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "address_proof_copy";
