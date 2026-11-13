-- 收据分摊 → 发票外键（便于按发票统计／筛选）
ALTER TABLE "receipt_allocations"
  ADD CONSTRAINT "receipt_allocations_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
