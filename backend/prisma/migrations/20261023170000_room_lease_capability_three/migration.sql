-- 租赁能力三态：只能整租 / 可整可分 / 只能分租（替换原 flexible | fixed_part）

-- 1) 先落到 text，便于改值
ALTER TABLE "rooms" ALTER COLUMN "lease_capability" DROP DEFAULT;
ALTER TABLE "rooms"
  ALTER COLUMN "lease_capability" TYPE TEXT
  USING "lease_capability"::text;

-- 2) 原 fixed_part → part_only；无份位标签时补上单份（分租符或编号末字母）
UPDATE "rooms"
SET
  "lease_capability" = 'part_only',
  "split_labels" = CASE
    WHEN COALESCE(cardinality("split_labels"), 0) = 0 THEN
      ARRAY[
        upper(
          COALESCE(
            NULLIF(trim(COALESCE("sublease_mark", '')), ''),
            NULLIF(substring("room_code" from '[A-Za-z]$'), ''),
            'A'
          )
        )
      ]
    ELSE "split_labels"
  END
WHERE "lease_capability" = 'fixed_part';

-- 3) 兜底非法值
UPDATE "rooms"
SET "lease_capability" = 'flexible'
WHERE "lease_capability" NOT IN ('whole_only', 'flexible', 'part_only');

-- 4) 重建枚举
DROP TYPE IF EXISTS "RoomLeaseCapability_new";
CREATE TYPE "RoomLeaseCapability_new" AS ENUM ('whole_only', 'flexible', 'part_only');

ALTER TABLE "rooms"
  ALTER COLUMN "lease_capability" TYPE "RoomLeaseCapability_new"
  USING "lease_capability"::"RoomLeaseCapability_new";

DROP TYPE "RoomLeaseCapability";
ALTER TYPE "RoomLeaseCapability_new" RENAME TO "RoomLeaseCapability";

ALTER TABLE "rooms"
  ALTER COLUMN "lease_capability" SET DEFAULT 'flexible'::"RoomLeaseCapability";

COMMENT ON TYPE "RoomLeaseCapability" IS '房间租赁能力';
COMMENT ON COLUMN "rooms"."lease_capability" IS '租赁能力：whole_only=只能整租；flexible=可整可分；part_only=只能分租';
COMMENT ON COLUMN "rooms"."split_labels" IS '分租份位标签（仅 flexible / part_only；whole_only 为空）';
