-- 忘记密码验证码表
CREATE TABLE "password_reset_tokens" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON TABLE "password_reset_tokens" IS '忘记密码：邮箱验证码（一次有效；过期或用后作废）';
COMMENT ON COLUMN "password_reset_tokens"."id" IS '主键';
COMMENT ON COLUMN "password_reset_tokens"."user_id" IS '所属用户 ID';
COMMENT ON COLUMN "password_reset_tokens"."code_hash" IS '验证码哈希（不可明文）';
COMMENT ON COLUMN "password_reset_tokens"."expires_at" IS '过期时间';
COMMENT ON COLUMN "password_reset_tokens"."consumed_at" IS '使用时间（空=未使用）';
COMMENT ON COLUMN "password_reset_tokens"."created_at" IS '创建时间';

-- 邮件 SMTP 系统参数（JSON）
INSERT INTO "system_settings" ("id", "key", "value", "label", "remark", "sort_order", "created_at", "updated_at")
VALUES (
  'sysset_mail_smtp',
  'mail_smtp',
  '{"host":"mail.wisesystemtech.com","port":587,"secure":false,"user":"rentalsystem@wisesystemtech.com","password":"","fromEmail":"rentalsystem@wisesystemtech.com","fromName":"Leapbud 租賃系統"}',
  '邮件 SMTP',
  '忘记密码发信等系统邮件：SMTP 主机/端口/账号/发件人。密码在系统设置中维护。',
  30,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
