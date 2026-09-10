-- 移除客户表多余的「关联客户」文本字段
ALTER TABLE "customers" DROP COLUMN IF EXISTS "related_customer";
