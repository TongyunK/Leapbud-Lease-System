-- 房间图片表（一房间多图）；迁移旧 image1/2/3 后删除固定列

CREATE TABLE "room_images" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "room_images_pkey" PRIMARY KEY ("id")
);

-- 从旧三列迁入（公开路径如 /leapbud_logo.png 原样写入 storage_key）
INSERT INTO "room_images" ("id", "room_id", "file_name", "storage_key", "sort_order", "created_at", "updated_at")
SELECT
    concat('rmi_', replace(gen_random_uuid()::text, '-', '')),
    r."id",
    CASE
        WHEN position('/' in reverse(coalesce(r."image1", ''))) > 0
            THEN reverse(split_part(reverse(r."image1"), '/', 1))
        ELSE coalesce(nullif(r."image1", ''), 'image1')
    END,
    r."image1",
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "rooms" r
WHERE r."image1" IS NOT NULL AND btrim(r."image1") <> '';

INSERT INTO "room_images" ("id", "room_id", "file_name", "storage_key", "sort_order", "created_at", "updated_at")
SELECT
    concat('rmi_', replace(gen_random_uuid()::text, '-', '')),
    r."id",
    CASE
        WHEN position('/' in reverse(coalesce(r."image2", ''))) > 0
            THEN reverse(split_part(reverse(r."image2"), '/', 1))
        ELSE coalesce(nullif(r."image2", ''), 'image2')
    END,
    r."image2",
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "rooms" r
WHERE r."image2" IS NOT NULL AND btrim(r."image2") <> '';

INSERT INTO "room_images" ("id", "room_id", "file_name", "storage_key", "sort_order", "created_at", "updated_at")
SELECT
    concat('rmi_', replace(gen_random_uuid()::text, '-', '')),
    r."id",
    CASE
        WHEN position('/' in reverse(coalesce(r."image3", ''))) > 0
            THEN reverse(split_part(reverse(r."image3"), '/', 1))
        ELSE coalesce(nullif(r."image3", ''), 'image3')
    END,
    r."image3",
    2,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "rooms" r
WHERE r."image3" IS NOT NULL AND btrim(r."image3") <> '';

ALTER TABLE "rooms" DROP COLUMN IF EXISTS "image1";
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "image2";
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "image3";

ALTER TABLE "room_images"
    ADD CONSTRAINT "room_images_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "room_images"
    ADD CONSTRAINT "room_images_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "room_images"
    ADD CONSTRAINT "room_images_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "room_images_room_id_sort_order_idx" ON "room_images"("room_id", "sort_order");
CREATE INDEX "room_images_created_by_idx" ON "room_images"("created_by");
CREATE INDEX "room_images_updated_by_idx" ON "room_images"("updated_by");

COMMENT ON TABLE "room_images" IS '房间图片（一房间多图，不限数量）';
COMMENT ON COLUMN "room_images"."id" IS '主键';
COMMENT ON COLUMN "room_images"."room_id" IS '所属房间 ID';
COMMENT ON COLUMN "room_images"."file_name" IS '原始文件名';
COMMENT ON COLUMN "room_images"."storage_key" IS '存储相对路径（相对 uploads 根目录；或以 /、http 开头的公开/外部地址）';
COMMENT ON COLUMN "room_images"."sort_order" IS '展示排序（越小越靠前）';
COMMENT ON COLUMN "room_images"."created_by" IS '创建人';
COMMENT ON COLUMN "room_images"."updated_by" IS '更新人';
COMMENT ON COLUMN "room_images"."created_at" IS '创建时间';
COMMENT ON COLUMN "room_images"."updated_at" IS '更新时间';
