-- 缴费周期统一为「名称-月数」格式
UPDATE "contracts" SET "payment_cycle" = '月繳-1' WHERE "payment_cycle" = '月繳';
UPDATE "contracts" SET "payment_cycle" = '季繳-3' WHERE "payment_cycle" = '季繳';
UPDATE "contracts" SET "payment_cycle" = '半年繳-6' WHERE "payment_cycle" = '半年繳';
UPDATE "contracts" SET "payment_cycle" = '年繳-12' WHERE "payment_cycle" = '年繳';
UPDATE "contracts" SET "payment_cycle" = '1年半-18' WHERE "payment_cycle" = '1年半';
UPDATE "contracts" SET "payment_cycle" = '2年-24' WHERE "payment_cycle" = '2年';

COMMENT ON COLUMN "contracts"."payment_cycle" IS '缴费周期：月繳-1 / 季繳-3 / 半年繳-6 / 年繳-12 / 1年半-18 / 2年-24';
