-- 发送邮箱密码：更新显示名／备注（密文格式 enc:v1 由应用层写入）
UPDATE "system_settings"
SET
  "label" = '系统发送邮箱密码',
  "remark" = 'SMTP 密码；入库加密（enc:v1）；仅在系统设置中维护，接口回传脱敏',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'mail_sending_email_password';

COMMENT ON COLUMN "system_settings"."value" IS '参数值（统一存文本；数值类自行解析；敏感项如邮件密码为 enc:v1 密文）';
