-- WhatsApp 商业号码／模板：说明／备注
ALTER TABLE "whatsapp_business_numbers" ADD COLUMN "remark" TEXT NOT NULL DEFAULT '';
ALTER TABLE "whatsapp_templates" ADD COLUMN "remark" TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN "whatsapp_business_numbers"."remark" IS '说明／备注';
COMMENT ON COLUMN "whatsapp_templates"."remark" IS '说明／备注';
