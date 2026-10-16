-- 修复尺寸区间「以上/以下」上下界填反的历史数据
-- 规则：X呎以上 → 仅下限 min=X；X呎以下 → 仅上限 max=X

UPDATE "room_config_options"
SET
  "min_sqft" = CAST(substring("label" from '([0-9]+(?:\.[0-9]+)?)呎以上') AS DECIMAL(12, 2)),
  "max_sqft" = NULL
WHERE "type" = 'size'
  AND "label" ~ '^[0-9]+(?:\.[0-9]+)?呎以上$'
  AND (
    "min_sqft" IS DISTINCT FROM CAST(substring("label" from '([0-9]+(?:\.[0-9]+)?)呎以上') AS DECIMAL(12, 2))
    OR "max_sqft" IS NOT NULL
  );

UPDATE "room_config_options"
SET
  "min_sqft" = NULL,
  "max_sqft" = CAST(substring("label" from '([0-9]+(?:\.[0-9]+)?)呎以下') AS DECIMAL(12, 2))
WHERE "type" = 'size'
  AND "label" ~ '^[0-9]+(?:\.[0-9]+)?呎以下$'
  AND (
    "max_sqft" IS DISTINCT FROM CAST(substring("label" from '([0-9]+(?:\.[0-9]+)?)呎以下') AS DECIMAL(12, 2))
    OR "min_sqft" IS NOT NULL
  );
