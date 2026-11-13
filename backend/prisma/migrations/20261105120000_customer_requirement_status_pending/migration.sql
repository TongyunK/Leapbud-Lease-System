-- 客户需求新增「未跟進」；默认改为未跟進；无合约的「跟進中」回填为未跟進
ALTER TABLE "customer_requirements"
  ALTER COLUMN "status" SET DEFAULT '未跟進';

COMMENT ON COLUMN "customer_requirements"."status" IS '状态：未跟進 / 跟進中 / 已簽約 / 已取消（随关联合约状态联动）';

UPDATE "customer_requirements" cr
SET "status" = '未跟進'
WHERE cr."status" = '跟進中'
  AND NOT EXISTS (
    SELECT 1
    FROM "contracts" c
    WHERE c."requirement_id" = cr."id"
  );
