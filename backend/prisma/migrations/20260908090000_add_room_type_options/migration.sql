-- CreateTable
CREATE TABLE "room_type_options" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'other',
    "hint" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_type_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_type_options_label_key" ON "room_type_options"("label");

-- CreateIndex
CREATE INDEX "room_type_options_active_sort_order_idx" ON "room_type_options"("active", "sort_order");

COMMENT ON TABLE "room_type_options" IS '房间类型字典（办公室 / 会议室等，可后台维护）';
COMMENT ON COLUMN "room_type_options"."id" IS '主键';
COMMENT ON COLUMN "room_type_options"."label" IS '类型名称（业务唯一，写入房间 room_type）';
COMMENT ON COLUMN "room_type_options"."tone" IS '展示色系：office / meeting / desk / studio / other';
COMMENT ON COLUMN "room_type_options"."hint" IS '表单选择时的简短说明';
COMMENT ON COLUMN "room_type_options"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "room_type_options"."active" IS '是否启用';
COMMENT ON COLUMN "room_type_options"."created_at" IS '创建时间';
COMMENT ON COLUMN "room_type_options"."updated_at" IS '更新时间';

-- Seed defaults if empty (idempotent via ON CONFLICT)
INSERT INTO "room_type_options" ("id", "label", "tone", "hint", "sort_order", "active", "created_at", "updated_at")
VALUES
  ('rt_office', '辦公室', 'office', '日常辦公空間', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt_meeting', '會議室', 'meeting', '會議 / 洽談空間', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("label") DO NOTHING;
