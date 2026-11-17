-- 系统发信 SMTP：由 JSON 整包改为「一键一值」（对齐运营侧 data_backup_sending_email_* 风格）

DELETE FROM "system_settings" WHERE "key" = 'mail_smtp';

INSERT INTO "system_settings" ("id", "key", "value", "label", "remark", "sort_order", "created_at", "updated_at")
VALUES
  (
    'sysset_mail_sending_email_host',
    'mail_sending_email_host',
    'mail.wisesystemtech.com',
    '系统发信 SMTP 主机',
    '忘记密码等系统邮件 SMTP 主机，如 mail.wisesystemtech.com',
    30,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'sysset_mail_sending_email',
    'mail_sending_email',
    'rentalsystem@wisesystemtech.com',
    '系统发信邮箱',
    'SMTP 登录账号与发件地址，如 rentalsystem@wisesystemtech.com',
    31,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'sysset_mail_sending_email_password',
    'mail_sending_email_password',
    '',
    '系统发信邮箱密码',
    'SMTP 密码；仅在系统设置中维护，接口回传脱敏',
    32,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'sysset_mail_sending_email_port',
    'mail_sending_email_port',
    '587',
    '系统发信 SMTP 端口',
    '常见 587（STARTTLS）或 465（SSL）',
    33,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'sysset_mail_sending_email_secure',
    'mail_sending_email_secure',
    'false',
    '系统发信 SMTP 使用 SSL',
    'true=SSL（多为 465）；false=STARTTLS（多为 587）',
    34,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'sysset_mail_sending_from_name',
    'mail_sending_from_name',
    'Leapbud 租賃系統',
    '系统发信显示名',
    '收件箱中显示的发件人名称',
    35,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "remark" = EXCLUDED."remark",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = CURRENT_TIMESTAMP;
