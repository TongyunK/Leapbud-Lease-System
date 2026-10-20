-- 功能按钮权限表
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
CREATE INDEX "permissions_module_idx" ON "permissions"("module");
CREATE INDEX "permissions_action_idx" ON "permissions"("action");
CREATE INDEX "permissions_sort_order_idx" ON "permissions"("sort_order");

COMMENT ON TABLE "permissions" IS '功能按钮权限（稳定 code，如 customers:create）';
COMMENT ON COLUMN "permissions"."id" IS '主键';
COMMENT ON COLUMN "permissions"."code" IS '权限编码（唯一，如 customers:create）';
COMMENT ON COLUMN "permissions"."module" IS '业务模块编码（如 customers）';
COMMENT ON COLUMN "permissions"."action" IS '操作编码：create / update / delete / import / batchDelete';
COMMENT ON COLUMN "permissions"."name" IS '显示名称（繁中）';
COMMENT ON COLUMN "permissions"."sort_order" IS '排序（越小越靠前）';
COMMENT ON COLUMN "permissions"."created_at" IS '创建时间';
COMMENT ON COLUMN "permissions"."updated_at" IS '更新时间';

-- 角色-功能按钮权限
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

COMMENT ON TABLE "role_permissions" IS '角色-功能按钮权限（多对多）';
COMMENT ON COLUMN "role_permissions"."role_id" IS '所属角色 ID';
COMMENT ON COLUMN "role_permissions"."permission_id" IS '所属权限 ID';
COMMENT ON COLUMN "role_permissions"."created_at" IS '创建时间';

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
