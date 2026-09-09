-- AlterTable
ALTER TABLE "buildings" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "buildings_active_idx" ON "buildings"("active");

COMMENT ON COLUMN "buildings"."active" IS '是否启用（停用后不出现在房间快捷胶囊等）';
