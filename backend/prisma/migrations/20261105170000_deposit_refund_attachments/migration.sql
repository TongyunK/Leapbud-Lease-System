-- 按金退还凭证多附件表；迁移旧 voucher_image / voucher_attachment 单路径字段

CREATE TABLE "deposit_refund_attachments" (
  "id" TEXT NOT NULL,
  "deposit_refund_id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deposit_refund_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deposit_refund_attachments_deposit_refund_id_sort_order_idx"
  ON "deposit_refund_attachments"("deposit_refund_id", "sort_order");
CREATE INDEX "deposit_refund_attachments_created_by_idx"
  ON "deposit_refund_attachments"("created_by");
CREATE INDEX "deposit_refund_attachments_updated_by_idx"
  ON "deposit_refund_attachments"("updated_by");

ALTER TABLE "deposit_refund_attachments"
  ADD CONSTRAINT "deposit_refund_attachments_deposit_refund_id_fkey"
  FOREIGN KEY ("deposit_refund_id") REFERENCES "deposit_refunds"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deposit_refund_attachments"
  ADD CONSTRAINT "deposit_refund_attachments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deposit_refund_attachments"
  ADD CONSTRAINT "deposit_refund_attachments_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "deposit_refund_attachments" IS '按金退还凭证附件（一退还单多文件）';
COMMENT ON COLUMN "deposit_refund_attachments"."id" IS '主键';
COMMENT ON COLUMN "deposit_refund_attachments"."deposit_refund_id" IS '所属按金退还记录 ID';
COMMENT ON COLUMN "deposit_refund_attachments"."file_name" IS '原始文件名';
COMMENT ON COLUMN "deposit_refund_attachments"."storage_key" IS '存储相对路径（相对 uploads 根；或以 http(s) 开头的外部地址）';
COMMENT ON COLUMN "deposit_refund_attachments"."sort_order" IS '展示排序（越小越靠前）';
COMMENT ON COLUMN "deposit_refund_attachments"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "deposit_refund_attachments"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "deposit_refund_attachments"."created_at" IS '创建时间';
COMMENT ON COLUMN "deposit_refund_attachments"."updated_at" IS '更新时间';

COMMENT ON COLUMN "deposit_refunds"."voucher_image" IS '退还凭证图片路径（旧字段；新凭证见 attachments）';
COMMENT ON COLUMN "deposit_refunds"."voucher_attachment" IS '退还凭证附件路径（旧字段；新凭证见 attachments）';

-- 旧图片路径 → 附件行
INSERT INTO "deposit_refund_attachments" (
  "id", "deposit_refund_id", "file_name", "storage_key", "sort_order", "created_at", "updated_at"
)
SELECT
  md5(dr."id" || ':img:' || dr."voucher_image"),
  dr."id",
  COALESCE(NULLIF(regexp_replace(dr."voucher_image", '^.*/', ''), ''), 'voucher-image'),
  dr."voucher_image",
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "deposit_refunds" dr
WHERE TRIM(COALESCE(dr."voucher_image", '')) <> '';

-- 旧附件路径 → 附件行（排在图片后）
INSERT INTO "deposit_refund_attachments" (
  "id", "deposit_refund_id", "file_name", "storage_key", "sort_order", "created_at", "updated_at"
)
SELECT
  md5(dr."id" || ':att:' || dr."voucher_attachment"),
  dr."id",
  COALESCE(NULLIF(regexp_replace(dr."voucher_attachment", '^.*/', ''), ''), 'voucher-attachment'),
  dr."voucher_attachment",
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "deposit_refunds" dr
WHERE TRIM(COALESCE(dr."voucher_attachment", '')) <> '';
