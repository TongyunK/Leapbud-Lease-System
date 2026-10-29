-- 合约发票「其他」类型：10, Other charges → Others
UPDATE "invoices"
SET "invoice_type" = 'Others'
WHERE "invoice_type" = '10, Other charges';

COMMENT ON COLUMN "invoices"."invoice_type" IS '发票类型（會議室短租 / Deposit / Others / 1, Charging Period；存储英文，短租除外）';
