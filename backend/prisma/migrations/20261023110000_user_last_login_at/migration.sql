-- 用户最后登录时间
ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMP(3);

COMMENT ON COLUMN "users"."last_login_at" IS '最后登录时间（成功登录时写入；未登录过为空）';
