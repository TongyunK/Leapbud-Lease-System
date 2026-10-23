-- 客户需求：长租 / 短租类型（短租后续可直接开票收据，无需合约）
ALTER TABLE "customer_requirements"
  ADD COLUMN "rental_type" TEXT NOT NULL DEFAULT 'long';

CREATE INDEX "customer_requirements_rental_type_idx" ON "customer_requirements"("rental_type");

COMMENT ON COLUMN "customer_requirements"."rental_type" IS '需求类型：long 长租（后续走合约）/ short 短租（可直接开票收据，无需合约）';
