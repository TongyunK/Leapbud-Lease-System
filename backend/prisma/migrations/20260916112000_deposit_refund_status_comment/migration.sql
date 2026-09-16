-- 按金退还状态注释与前端四态对齐
COMMENT ON COLUMN "deposit_refunds"."status" IS '状态（草稿 / 未退按金 / 已退按金 / 已取消）';
