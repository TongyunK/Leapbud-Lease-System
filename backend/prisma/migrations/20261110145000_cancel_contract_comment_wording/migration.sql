-- 结算／变更日志注释：解约 → 取消合约（仅注释，无结构变更）
COMMENT ON TYPE "ContractSettlementType" IS '合约结算类型：VACATE=退租，CANCEL=取消合约';
COMMENT ON TABLE "contract_settlements" IS '合约结算单（统一：退租 VACATE / 签约中取消 CANCEL；无审批，操作员确认即落账）';
COMMENT ON COLUMN "contract_settlements"."type" IS '结算类型：VACATE=退租，CANCEL=取消合约';
COMMENT ON COLUMN "contract_settlements"."termination_date" IS '退租日期（业务日；可与结算日期不同；取消合约可空）';
COMMENT ON TABLE "contract_change_logs" IS '签约中合约变更审计日志（租金／押金／借出物品／取消合约等）';
