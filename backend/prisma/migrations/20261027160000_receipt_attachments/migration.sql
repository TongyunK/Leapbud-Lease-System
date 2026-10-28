-- 收据收款凭证：由 voucher_1/2 改为多附件表
CREATE TABLE IF NOT EXISTS "receipt_attachments" (
  "id" TEXT NOT NULL,
  "receipt_id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receipt_attachments_pkey" PRIMARY KEY ("id")
);

COMMENT ON TABLE "receipt_attachments" IS '收据收款凭证附件（一收据多文件，不限数量与格式）';
COMMENT ON COLUMN "receipt_attachments"."id" IS '主键';
COMMENT ON COLUMN "receipt_attachments"."receipt_id" IS '所属收据 ID';
COMMENT ON COLUMN "receipt_attachments"."file_name" IS '原始文件名';
COMMENT ON COLUMN "receipt_attachments"."storage_key" IS '存储相对路径（相对 uploads 根；或以 http(s) 开头的外部地址）';
COMMENT ON COLUMN "receipt_attachments"."sort_order" IS '展示排序（越小越靠前）';
COMMENT ON COLUMN "receipt_attachments"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "receipt_attachments"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "receipt_attachments"."created_at" IS '创建时间';
COMMENT ON COLUMN "receipt_attachments"."updated_at" IS '更新时间';

CREATE INDEX IF NOT EXISTS "receipt_attachments_receipt_id_sort_order_idx"
  ON "receipt_attachments"("receipt_id", "sort_order");
CREATE INDEX IF NOT EXISTS "receipt_attachments_created_by_idx"
  ON "receipt_attachments"("created_by");
CREATE INDEX IF NOT EXISTS "receipt_attachments_updated_by_idx"
  ON "receipt_attachments"("updated_by");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipt_attachments_receipt_id_fkey'
  ) THEN
    ALTER TABLE "receipt_attachments"
      ADD CONSTRAINT "receipt_attachments_receipt_id_fkey"
      FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipt_attachments_created_by_fkey'
  ) THEN
    ALTER TABLE "receipt_attachments"
      ADD CONSTRAINT "receipt_attachments_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipt_attachments_updated_by_fkey'
  ) THEN
    ALTER TABLE "receipt_attachments"
      ADD CONSTRAINT "receipt_attachments_updated_by_fkey"
      FOREIGN KEY ("updated_by") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 迁移旧 voucher_1 / voucher_2 非空路径到附件表（列已不存在则跳过）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'receipts' AND column_name = 'voucher_1'
  ) THEN
    INSERT INTO "receipt_attachments" ("id", "receipt_id", "file_name", "storage_key", "sort_order", "created_at", "updated_at")
    SELECT
      md5(r."id" || ':v1:' || r."voucher_1"),
      r."id",
      COALESCE(NULLIF(regexp_replace(r."voucher_1", '^.*/', ''), ''), 'voucher1'),
      r."voucher_1",
      0,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM "receipts" r
    WHERE COALESCE(TRIM(r."voucher_1"), '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM "receipt_attachments" a
        WHERE a."receipt_id" = r."id" AND a."storage_key" = r."voucher_1"
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'receipts' AND column_name = 'voucher_2'
  ) THEN
    INSERT INTO "receipt_attachments" ("id", "receipt_id", "file_name", "storage_key", "sort_order", "created_at", "updated_at")
    SELECT
      md5(r."id" || ':v2:' || r."voucher_2"),
      r."id",
      COALESCE(NULLIF(regexp_replace(r."voucher_2", '^.*/', ''), ''), 'voucher2'),
      r."voucher_2",
      1,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM "receipts" r
    WHERE COALESCE(TRIM(r."voucher_2"), '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM "receipt_attachments" a
        WHERE a."receipt_id" = r."id" AND a."storage_key" = r."voucher_2"
      );
  END IF;
END $$;

ALTER TABLE "receipts" DROP COLUMN IF EXISTS "voucher_1";
ALTER TABLE "receipts" DROP COLUMN IF EXISTS "voucher_2";
