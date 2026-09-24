-- 撤销：银行名称 / 付款条款改回写死在发票 Word 模板中，不入库
ALTER TABLE "buildings" DROP COLUMN IF EXISTS "bank_name";
ALTER TABLE "buildings" DROP COLUMN IF EXISTS "payment_terms";
