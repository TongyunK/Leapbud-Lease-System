-- 自动编号：补入应收／按金退还／结算单／退款单／资金流水／应收核销

ALTER TYPE "NumberingBizKey" RENAME TO "NumberingBizKey_old";

CREATE TYPE "NumberingBizKey" AS ENUM (
  'customer',
  'customerRequirement',
  'invoice',
  'receipt',
  'receivable',
  'depositRefund',
  'contractSettlement',
  'refundOrder',
  'cashFlow',
  'receivableWriteoff'
);
COMMENT ON TYPE "NumberingBizKey" IS '自动编号业务键：customer=客户 / customerRequirement=客户需求 / invoice=发票 / receipt=收据 / receivable=应收 / depositRefund=按金退还 / contractSettlement=合约终止结算单 / refundOrder=退款单 / cashFlow=资金流水 / receivableWriteoff=应收核销（合约编号不走本规则）';

ALTER TABLE "numbering_rules"
  ALTER COLUMN "biz_key" TYPE "NumberingBizKey"
  USING ("biz_key"::text::"NumberingBizKey");

DROP TYPE "NumberingBizKey_old";

INSERT INTO "numbering_rules" (
  "id", "biz_key", "name", "format", "start_value", "reset_cycle",
  "current_seq", "period_key", "active", "sort_order", "created_at", "updated_at"
) VALUES
  ('nr_receivable', 'receivable', '應收編號', 'AR%YY%MM%DD%04d', 1, 'daily', 0, '', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('nr_deposit_refund', 'depositRefund', '按金退還編號', 'DRF%YY%MM%DD%04d', 1, 'daily', 0, '', true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('nr_contract_settlement', 'contractSettlement', '合約終止結算單編號', 'CST%YY%MM%DD%04d', 1, 'daily', 0, '', true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('nr_refund_order', 'refundOrder', '退款單編號', 'RFO%YY%MM%DD%04d', 1, 'daily', 0, '', true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('nr_cash_flow', 'cashFlow', '資金流水編號', 'CFL%YY%MM%DD%04d', 1, 'daily', 0, '', true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('nr_receivable_writeoff', 'receivableWriteoff', '應收核銷編號', 'WOF%YY%MM%DD%04d', 1, 'daily', 0, '', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
