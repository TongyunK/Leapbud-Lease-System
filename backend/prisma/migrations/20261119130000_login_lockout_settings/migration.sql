-- 登录连续输错锁定：用户字段 + 系统参数

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "failed_login_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "login_locked_until" TIMESTAMP(3);

COMMENT ON COLUMN "users"."failed_login_count" IS '连续密码错误次数（成功登录清零）';
COMMENT ON COLUMN "users"."login_locked_until" IS '登录锁定截止时间（冷却结束前不可登录；空表示未锁定）';

INSERT INTO "system_settings" ("id", "key", "value", "label", "remark", "sort_order", "created_at", "updated_at")
VALUES (
  'sysset_login_max_failed_attempts',
  'login_max_failed_attempts',
  '5',
  '登入密碼連續錯誤鎖定次數',
  '同一帳號連續輸錯密碼達到此次數後進入冷卻鎖定。範圍 1–30，預設 5。',
  50,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "system_settings" ("id", "key", "value", "label", "remark", "sort_order", "created_at", "updated_at")
VALUES (
  'sysset_login_lockout_minutes',
  'login_lockout_minutes',
  '15',
  '登入鎖定冷卻分鐘數',
  '觸發鎖定後須等待多少分鐘才能再次嘗試登入。範圍 1–1440，預設 15。',
  51,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
