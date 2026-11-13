-- 应退状态增加 partial（部分退款）
-- 注意：PostgreSQL 要求新 enum 值在单独事务提交后才能被 UPDATE 使用

ALTER TYPE "ContractSettlementRefundStatus" ADD VALUE IF NOT EXISTS 'partial';

COMMENT ON TYPE "ContractSettlementRefundStatus" IS '合约终止结算应退状态：pending_refund=待退款，partial=部分退款，settled=已结清';
COMMENT ON COLUMN "contract_settlements"."refund_status" IS '应退状态：pending_refund=待退款，partial=部分退款，settled=已结清';
COMMENT ON COLUMN "contract_settlements"."collect_status" IS '应收（应补）状态：none=无应补，pending_collect=待收，partial=部分收款，settled=已结清';
