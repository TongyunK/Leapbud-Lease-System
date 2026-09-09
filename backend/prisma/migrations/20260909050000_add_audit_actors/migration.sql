-- Add created_by / updated_by audit actors to all business tables

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "created_by" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "updated_by" TEXT NOT NULL DEFAULT '';

ALTER TABLE "room_config_options"
  ADD COLUMN IF NOT EXISTS "created_by" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "updated_by" TEXT NOT NULL DEFAULT '';

ALTER TABLE "room_type_options"
  ADD COLUMN IF NOT EXISTS "created_by" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "updated_by" TEXT NOT NULL DEFAULT '';

ALTER TABLE "buildings"
  ADD COLUMN IF NOT EXISTS "created_by" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "updated_by" TEXT NOT NULL DEFAULT '';

ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "updated_by" TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN "users"."created_by" IS '创建人';
COMMENT ON COLUMN "users"."updated_by" IS '更新人';
COMMENT ON COLUMN "room_config_options"."created_by" IS '创建人';
COMMENT ON COLUMN "room_config_options"."updated_by" IS '更新人';
COMMENT ON COLUMN "room_type_options"."created_by" IS '创建人';
COMMENT ON COLUMN "room_type_options"."updated_by" IS '更新人';
COMMENT ON COLUMN "buildings"."created_by" IS '创建人';
COMMENT ON COLUMN "buildings"."updated_by" IS '更新人';
COMMENT ON COLUMN "rooms"."updated_by" IS '更新人';
