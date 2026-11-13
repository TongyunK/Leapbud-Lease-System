-- 收据不再区分有效／已作廢：金额不可变，退款以应收已退＋资金流水为准
ALTER TABLE "receipts" DROP COLUMN IF EXISTS "status";
