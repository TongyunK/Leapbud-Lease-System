-- customers.account_manager：显示名文本 → users.id 外键（无法匹配的置空）

ALTER TABLE "customers" ADD COLUMN "account_manager_fk" TEXT;

UPDATE "customers" AS c
SET "account_manager_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(c."account_manager"), '') IS NOT NULL
  AND (c."account_manager" = u.account OR c."account_manager" = u.display_name);

DROP INDEX IF EXISTS "customers_account_manager_idx";
ALTER TABLE "customers" DROP COLUMN "account_manager";
ALTER TABLE "customers" RENAME COLUMN "account_manager_fk" TO "account_manager";

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_account_manager_fkey"
  FOREIGN KEY ("account_manager") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "customers_account_manager_idx" ON "customers"("account_manager");

COMMENT ON COLUMN "customers"."account_manager" IS '客户经理用户 ID';
