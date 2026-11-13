-- 历史：打款备注被拼接到 refund_orders.remark（换行追加），与开单备注混在一起。
-- 打款备注应只在 cash_flows；此处保留首行（开单备注），去掉后续拼接行。
UPDATE "refund_orders"
SET "remark" = split_part("remark", E'\n', 1)
WHERE position(E'\n' IN "remark") > 0;
