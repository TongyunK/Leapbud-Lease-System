-- 结算明细：定金抵扣（超出按金赔偿等）独立类型，不计入按金扣除合计
ALTER TYPE "ContractSettlementItemType" ADD VALUE IF NOT EXISTS 'BOOKING_DEPOSIT_OFFSET';
