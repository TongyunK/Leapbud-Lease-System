-- billingKind 收成两档：manual=用户手动；auto=系统自动（类型看 invoiceType）
UPDATE "invoices"
SET "billing_kind" = 'auto'
WHERE "billing_kind" IN ('deposit', 'rent');

COMMENT ON COLUMN "invoices"."billing_kind" IS '产生方式：manual=用户手动；auto=系统自动（按金／租金等由 invoiceType 区分）';
COMMENT ON COLUMN "invoices"."period_start" IS '租金账单周期起（缴费期租金发票；UTC 日期）';
COMMENT ON COLUMN "invoices"."period_end" IS '租金账单周期止（缴费期租金发票；UTC 日期，含当日）';
