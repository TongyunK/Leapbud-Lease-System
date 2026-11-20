-- WhatsApp 发送模板：示意图
ALTER TABLE "whatsapp_templates" ADD COLUMN "diagram_key" TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN "whatsapp_templates"."diagram_key" IS '示意图（uploads 相对键；空表示未上传）';
