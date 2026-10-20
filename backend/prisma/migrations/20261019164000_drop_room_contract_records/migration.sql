-- 删除旧系统冗余字段：房间上的历史合约记录文本列表
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "contract_records";
