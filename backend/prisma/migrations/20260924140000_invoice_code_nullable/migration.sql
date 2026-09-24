-- 发票编号改为可空：旧系统待开票未赋号时保持空白（唯一约束下多个 NULL 合法）
ALTER TABLE "invoices" ALTER COLUMN "invoice_code" DROP NOT NULL;

COMMENT ON COLUMN "invoices"."invoice_code" IS '发票编号（可空；待开票尚未赋号时为空；有值时业务唯一）';
