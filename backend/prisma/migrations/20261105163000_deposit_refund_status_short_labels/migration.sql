-- 按金退还状态文案缩短：未退按金 → 未退；已退按金 → 已退
UPDATE "deposit_refunds"
SET "status" = '未退',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = '未退按金';

UPDATE "deposit_refunds"
SET "status" = '已退',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = '已退按金';

COMMENT ON COLUMN "deposit_refunds"."status" IS '状态（草稿 / 未退 / 已退 / 已取消）';
