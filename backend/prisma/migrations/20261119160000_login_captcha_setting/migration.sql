-- 登录页机器人验证（图形验证码）开关

INSERT INTO "system_settings" ("id", "key", "value", "label", "remark", "sort_order", "created_at", "updated_at")
VALUES (
  'sysset_login_captcha_enabled',
  'login_captcha_enabled',
  'false',
  '登入機器人驗證',
  '開啟後登入頁須輸入圖形驗證碼。預設關閉。',
  52,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
