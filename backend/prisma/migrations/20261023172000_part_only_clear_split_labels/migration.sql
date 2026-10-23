-- 只能分租：用独立后缀房间表示份位，不在房间内配置 split_labels
UPDATE "rooms"
SET "split_labels" = ARRAY[]::text[]
WHERE "lease_capability" = 'part_only';

COMMENT ON COLUMN "rooms"."lease_capability" IS '租赁能力：whole_only=只能整租；flexible=可整可分（房间内 A/B/C）；part_only=只能分租（独立后缀房间，无份位列表）';
COMMENT ON COLUMN "rooms"."split_labels" IS '分租份位标签（仅 flexible；whole_only / part_only 为空）';
