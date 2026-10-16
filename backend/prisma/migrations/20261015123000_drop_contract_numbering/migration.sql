-- 合约编号改为「房间编号 + 当日日期」，不再使用自动编号规则

DELETE FROM "numbering_rules" WHERE "id" = 'nr_contract' OR "biz_key" = 'contract';

ALTER TYPE "NumberingBizKey" RENAME TO "NumberingBizKey_old";

CREATE TYPE "NumberingBizKey" AS ENUM (
  'customer',
  'customerRequirement',
  'invoice',
  'receipt'
);
COMMENT ON TYPE "NumberingBizKey" IS '自动编号业务键：customer=客户 / customerRequirement=客户需求 / invoice=发票 / receipt=收据（合约编号不走本规则）';

ALTER TABLE "numbering_rules"
  ALTER COLUMN "biz_key" TYPE "NumberingBizKey"
  USING (
    CASE
      WHEN "biz_key"::text = 'contract' THEN NULL
      ELSE "biz_key"::text::"NumberingBizKey"
    END
  );

DROP TYPE "NumberingBizKey_old";
