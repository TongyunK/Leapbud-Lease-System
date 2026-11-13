-- 收据状态：有效（计入实收）/ 已作廢（冲销留痕，reports 默认可排除）
ALTER TABLE "receipts" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT '有效';

CREATE INDEX IF NOT EXISTS "receipts_status_idx" ON "receipts"("status");

COMMENT ON COLUMN "receipts"."status" IS '状态：有效=计入实收（默认）；已作廢=冲销留痕（不计入实收；reports 默认可排除）';
