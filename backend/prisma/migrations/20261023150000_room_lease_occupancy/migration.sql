-- 房间租赁能力 + 份位；合约占用方式 + 份位标签

CREATE TYPE "RoomLeaseCapability" AS ENUM ('flexible', 'fixed_part');

COMMENT ON TYPE "RoomLeaseCapability" IS '房间租赁能力：flexible=可整可分；fixed_part=仅固定份位';

ALTER TABLE "rooms"
  ADD COLUMN "lease_capability" "RoomLeaseCapability" NOT NULL DEFAULT 'flexible',
  ADD COLUMN "split_labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN "rooms"."lease_capability" IS '租赁能力：flexible=可整可分，fixed_part=仅固定份位';
COMMENT ON COLUMN "rooms"."split_labels" IS '可分租份位标签（如 A、B、C）；fixed_part 时可为空';
COMMENT ON COLUMN "rooms"."sublease_mark" IS '分租标记（兼容旧字段；固定份位字母或摘要）';

ALTER TABLE "contracts"
  ADD COLUMN "occupancy_mode" TEXT NOT NULL DEFAULT 'whole',
  ADD COLUMN "part_label" TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN "contracts"."occupancy_mode" IS '占用方式：whole=整租，part=分租某份位';
COMMENT ON COLUMN "contracts"."part_label" IS '分租份位标签（occupancyMode=part 时，如 A/B/C）';
COMMENT ON COLUMN "contracts"."lease_type" IS '租赁方式：整租 / 分租首用戶 / 分租次用戶（字典展示，可与 occupancyMode 并存）';
COMMENT ON COLUMN "contracts"."sublease_mark" IS '分租符号（与 part_label 同步，兼容旧导出）';

-- 存量：编号末尾字母 → 固定份位；其余可整可分并默认 A/B/C
UPDATE "rooms"
SET
  "lease_capability" = 'fixed_part',
  "split_labels" = ARRAY[]::TEXT[],
  "sublease_mark" = COALESCE(
    NULLIF(TRIM("sublease_mark"), ''),
    UPPER(SUBSTRING("room_code" FROM '.$'))
  )
WHERE "room_code" ~ '[A-Za-z]$';

UPDATE "rooms"
SET
  "lease_capability" = 'flexible',
  "split_labels" = CASE
    WHEN cardinality("split_labels") > 0 THEN "split_labels"
    ELSE ARRAY['A', 'B', 'C']::TEXT[]
  END
WHERE "lease_capability" = 'flexible'
  AND NOT ("room_code" ~ '[A-Za-z]$');

-- 存量合约：已有分租符则视为分租该份
UPDATE "contracts"
SET
  "occupancy_mode" = 'part',
  "part_label" = UPPER(TRIM("sublease_mark"))
WHERE TRIM(COALESCE("sublease_mark", '')) <> '';
