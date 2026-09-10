-- created_by / updated_by：由账号/显示名文本改为 users.id 外键（无法匹配的置空）

-- ========== room_config_options ==========
ALTER TABLE "room_config_options" ADD COLUMN "created_by_fk" TEXT;
ALTER TABLE "room_config_options" ADD COLUMN "updated_by_fk" TEXT;

UPDATE "room_config_options" AS t
SET "created_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."created_by"), '') IS NOT NULL
  AND (t."created_by" = u.account OR t."created_by" = u.display_name);

UPDATE "room_config_options" AS t
SET "updated_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."updated_by"), '') IS NOT NULL
  AND (t."updated_by" = u.account OR t."updated_by" = u.display_name);

ALTER TABLE "room_config_options" DROP COLUMN "created_by";
ALTER TABLE "room_config_options" DROP COLUMN "updated_by";
ALTER TABLE "room_config_options" RENAME COLUMN "created_by_fk" TO "created_by";
ALTER TABLE "room_config_options" RENAME COLUMN "updated_by_fk" TO "updated_by";

ALTER TABLE "room_config_options"
  ADD CONSTRAINT "room_config_options_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "room_config_options"
  ADD CONSTRAINT "room_config_options_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "room_config_options_created_by_idx" ON "room_config_options"("created_by");
CREATE INDEX "room_config_options_updated_by_idx" ON "room_config_options"("updated_by");

COMMENT ON COLUMN "room_config_options"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "room_config_options"."updated_by" IS '更新人用户 ID';

-- ========== room_type_options ==========
ALTER TABLE "room_type_options" ADD COLUMN "created_by_fk" TEXT;
ALTER TABLE "room_type_options" ADD COLUMN "updated_by_fk" TEXT;

UPDATE "room_type_options" AS t
SET "created_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."created_by"), '') IS NOT NULL
  AND (t."created_by" = u.account OR t."created_by" = u.display_name);

UPDATE "room_type_options" AS t
SET "updated_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."updated_by"), '') IS NOT NULL
  AND (t."updated_by" = u.account OR t."updated_by" = u.display_name);

ALTER TABLE "room_type_options" DROP COLUMN "created_by";
ALTER TABLE "room_type_options" DROP COLUMN "updated_by";
ALTER TABLE "room_type_options" RENAME COLUMN "created_by_fk" TO "created_by";
ALTER TABLE "room_type_options" RENAME COLUMN "updated_by_fk" TO "updated_by";

ALTER TABLE "room_type_options"
  ADD CONSTRAINT "room_type_options_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "room_type_options"
  ADD CONSTRAINT "room_type_options_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "room_type_options_created_by_idx" ON "room_type_options"("created_by");
CREATE INDEX "room_type_options_updated_by_idx" ON "room_type_options"("updated_by");

COMMENT ON COLUMN "room_type_options"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "room_type_options"."updated_by" IS '更新人用户 ID';

-- ========== buildings ==========
ALTER TABLE "buildings" ADD COLUMN "created_by_fk" TEXT;
ALTER TABLE "buildings" ADD COLUMN "updated_by_fk" TEXT;

UPDATE "buildings" AS t
SET "created_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."created_by"), '') IS NOT NULL
  AND (t."created_by" = u.account OR t."created_by" = u.display_name);

UPDATE "buildings" AS t
SET "updated_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."updated_by"), '') IS NOT NULL
  AND (t."updated_by" = u.account OR t."updated_by" = u.display_name);

ALTER TABLE "buildings" DROP COLUMN "created_by";
ALTER TABLE "buildings" DROP COLUMN "updated_by";
ALTER TABLE "buildings" RENAME COLUMN "created_by_fk" TO "created_by";
ALTER TABLE "buildings" RENAME COLUMN "updated_by_fk" TO "updated_by";

ALTER TABLE "buildings"
  ADD CONSTRAINT "buildings_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "buildings"
  ADD CONSTRAINT "buildings_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "buildings_created_by_idx" ON "buildings"("created_by");
CREATE INDEX "buildings_updated_by_idx" ON "buildings"("updated_by");

COMMENT ON COLUMN "buildings"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "buildings"."updated_by" IS '更新人用户 ID';

-- ========== rooms ==========
ALTER TABLE "rooms" ADD COLUMN "created_by_fk" TEXT;
ALTER TABLE "rooms" ADD COLUMN "updated_by_fk" TEXT;

UPDATE "rooms" AS t
SET "created_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."created_by"), '') IS NOT NULL
  AND (t."created_by" = u.account OR t."created_by" = u.display_name);

UPDATE "rooms" AS t
SET "updated_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."updated_by"), '') IS NOT NULL
  AND (t."updated_by" = u.account OR t."updated_by" = u.display_name);

ALTER TABLE "rooms" DROP COLUMN "created_by";
ALTER TABLE "rooms" DROP COLUMN "updated_by";
ALTER TABLE "rooms" RENAME COLUMN "created_by_fk" TO "created_by";
ALTER TABLE "rooms" RENAME COLUMN "updated_by_fk" TO "updated_by";

ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "rooms_created_by_idx" ON "rooms"("created_by");
CREATE INDEX "rooms_updated_by_idx" ON "rooms"("updated_by");

COMMENT ON COLUMN "rooms"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "rooms"."updated_by" IS '更新人用户 ID';

-- ========== customers ==========
ALTER TABLE "customers" ADD COLUMN "created_by_fk" TEXT;
ALTER TABLE "customers" ADD COLUMN "updated_by_fk" TEXT;

UPDATE "customers" AS t
SET "created_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."created_by"), '') IS NOT NULL
  AND (t."created_by" = u.account OR t."created_by" = u.display_name);

UPDATE "customers" AS t
SET "updated_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."updated_by"), '') IS NOT NULL
  AND (t."updated_by" = u.account OR t."updated_by" = u.display_name);

ALTER TABLE "customers" DROP COLUMN "created_by";
ALTER TABLE "customers" DROP COLUMN "updated_by";
ALTER TABLE "customers" RENAME COLUMN "created_by_fk" TO "created_by";
ALTER TABLE "customers" RENAME COLUMN "updated_by_fk" TO "updated_by";

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "customers_created_by_idx" ON "customers"("created_by");
CREATE INDEX "customers_updated_by_idx" ON "customers"("updated_by");

COMMENT ON COLUMN "customers"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "customers"."updated_by" IS '更新人用户 ID';

-- ========== occupants ==========
ALTER TABLE "occupants" ADD COLUMN "created_by_fk" TEXT;
ALTER TABLE "occupants" ADD COLUMN "updated_by_fk" TEXT;

UPDATE "occupants" AS t
SET "created_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."created_by"), '') IS NOT NULL
  AND (t."created_by" = u.account OR t."created_by" = u.display_name);

UPDATE "occupants" AS t
SET "updated_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."updated_by"), '') IS NOT NULL
  AND (t."updated_by" = u.account OR t."updated_by" = u.display_name);

ALTER TABLE "occupants" DROP COLUMN "created_by";
ALTER TABLE "occupants" DROP COLUMN "updated_by";
ALTER TABLE "occupants" RENAME COLUMN "created_by_fk" TO "created_by";
ALTER TABLE "occupants" RENAME COLUMN "updated_by_fk" TO "updated_by";

ALTER TABLE "occupants"
  ADD CONSTRAINT "occupants_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "occupants"
  ADD CONSTRAINT "occupants_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "occupants_created_by_idx" ON "occupants"("created_by");
CREATE INDEX "occupants_updated_by_idx" ON "occupants"("updated_by");

COMMENT ON COLUMN "occupants"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "occupants"."updated_by" IS '更新人用户 ID';

-- ========== users（自引用，最后处理）==========
ALTER TABLE "users" ADD COLUMN "created_by_fk" TEXT;
ALTER TABLE "users" ADD COLUMN "updated_by_fk" TEXT;

UPDATE "users" AS t
SET "created_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."created_by"), '') IS NOT NULL
  AND (t."created_by" = u.account OR t."created_by" = u.display_name);

UPDATE "users" AS t
SET "updated_by_fk" = u.id
FROM "users" u
WHERE NULLIF(TRIM(t."updated_by"), '') IS NOT NULL
  AND (t."updated_by" = u.account OR t."updated_by" = u.display_name);

ALTER TABLE "users" DROP COLUMN "created_by";
ALTER TABLE "users" DROP COLUMN "updated_by";
ALTER TABLE "users" RENAME COLUMN "created_by_fk" TO "created_by";
ALTER TABLE "users" RENAME COLUMN "updated_by_fk" TO "updated_by";

ALTER TABLE "users"
  ADD CONSTRAINT "users_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users"
  ADD CONSTRAINT "users_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_created_by_idx" ON "users"("created_by");
CREATE INDEX "users_updated_by_idx" ON "users"("updated_by");

COMMENT ON COLUMN "users"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "users"."updated_by" IS '更新人用户 ID';
