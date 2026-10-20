-- 用户角色跟随角色管理表：users.role 改为 text，外键引用 roles.code

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE TEXT USING ("role"::text);
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';

-- 确保系统角色存在（已有则跳过）
INSERT INTO "roles" ("id", "code", "name", "description", "sort_order", "active", "is_system", "created_at", "updated_at")
VALUES
  ('role_system_admin', 'admin', '管理員', '系統管理員', 0, true, true, NOW(), NOW()),
  ('role_system_user', 'user', '普通用戶', '業務人員', 10, true, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

-- 若用户上仍有未建档的角色编码，自动补一条（避免加外键失败）
INSERT INTO "roles" ("id", "code", "name", "description", "sort_order", "active", "is_system", "created_at", "updated_at")
SELECT
  'role_migrated_' || u.role,
  u.role,
  u.role,
  '由用户数据自动补齐',
  999,
  true,
  false,
  NOW(),
  NOW()
FROM (SELECT DISTINCT "role" FROM "users") u
WHERE NOT EXISTS (SELECT 1 FROM "roles" r WHERE r."code" = u.role);

ALTER TABLE "users"
  ADD CONSTRAINT "users_role_fkey"
  FOREIGN KEY ("role") REFERENCES "roles"("code")
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

COMMENT ON COLUMN "users"."role" IS '角色编码（对应 roles.code）';
