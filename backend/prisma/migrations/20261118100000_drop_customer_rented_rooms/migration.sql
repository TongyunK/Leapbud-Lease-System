-- 客户在租房间改由占用中合约推导，删除手工文本列
ALTER TABLE "customers" DROP COLUMN IF EXISTS "rented_rooms";
