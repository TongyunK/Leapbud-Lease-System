-- CreateEnum
CREATE TYPE "MenuType" AS ENUM ('directory', 'menu');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "type" "MenuType" NOT NULL DEFAULT 'menu',
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL DEFAULT '',
    "route_name" TEXT NOT NULL DEFAULT '',
    "path" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "permission" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_menus" (
    "role_id" TEXT NOT NULL,
    "menu_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_menus_pkey" PRIMARY KEY ("role_id","menu_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE INDEX "roles_active_idx" ON "roles"("active");
CREATE INDEX "roles_sort_order_idx" ON "roles"("sort_order");
CREATE INDEX "roles_created_by_idx" ON "roles"("created_by");
CREATE INDEX "roles_updated_by_idx" ON "roles"("updated_by");

CREATE INDEX "menus_parent_id_idx" ON "menus"("parent_id");
CREATE INDEX "menus_type_idx" ON "menus"("type");
CREATE INDEX "menus_route_name_idx" ON "menus"("route_name");
CREATE INDEX "menus_active_idx" ON "menus"("active");
CREATE INDEX "menus_sort_order_idx" ON "menus"("sort_order");
CREATE INDEX "menus_created_by_idx" ON "menus"("created_by");
CREATE INDEX "menus_updated_by_idx" ON "menus"("updated_by");

CREATE INDEX "role_menus_menu_id_idx" ON "role_menus"("menu_id");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "roles" ADD CONSTRAINT "roles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "menus" ADD CONSTRAINT "menus_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menus" ADD CONSTRAINT "menus_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "menus" ADD CONSTRAINT "menus_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "role_menus" ADD CONSTRAINT "role_menus_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_menus" ADD CONSTRAINT "role_menus_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON TYPE "MenuType" IS '菜单类型：directory=目录，menu=菜单页';

COMMENT ON TABLE "roles" IS '系统角色（可配置；与 User.role 枚举并存，后续可关联）';
COMMENT ON COLUMN "roles"."id" IS '主键';
COMMENT ON COLUMN "roles"."code" IS '角色编码（唯一，如 admin / user）';
COMMENT ON COLUMN "roles"."name" IS '角色名称';
COMMENT ON COLUMN "roles"."description" IS '角色说明';
COMMENT ON COLUMN "roles"."sort_order" IS '排序（越小越靠前）';
COMMENT ON COLUMN "roles"."active" IS '是否启用';
COMMENT ON COLUMN "roles"."is_system" IS '是否系统内置（不可删除）';
COMMENT ON COLUMN "roles"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "roles"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "roles"."created_at" IS '创建时间';
COMMENT ON COLUMN "roles"."updated_at" IS '更新时间';

COMMENT ON TABLE "menus" IS '系统菜单（侧栏目录 / 页面）';
COMMENT ON COLUMN "menus"."id" IS '主键';
COMMENT ON COLUMN "menus"."parent_id" IS '上级菜单 ID（目录下挂菜单；顶级为空）';
COMMENT ON COLUMN "menus"."type" IS '菜单类型：directory=目录，menu=菜单页';
COMMENT ON COLUMN "menus"."name" IS '显示名称（默认繁中）';
COMMENT ON COLUMN "menus"."name_key" IS 'i18n 键（如 menu.users；空则用 name）';
COMMENT ON COLUMN "menus"."route_name" IS '前端路由 name（如 users）';
COMMENT ON COLUMN "menus"."path" IS '路由 path（相对或绝对）';
COMMENT ON COLUMN "menus"."icon" IS '图标标识（前端映射用）';
COMMENT ON COLUMN "menus"."sort_order" IS '排序（越小越靠前）';
COMMENT ON COLUMN "menus"."visible" IS '是否在侧栏可见';
COMMENT ON COLUMN "menus"."active" IS '是否启用';
COMMENT ON COLUMN "menus"."permission" IS '权限标识（预留，如 system:users）';
COMMENT ON COLUMN "menus"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "menus"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "menus"."created_at" IS '创建时间';
COMMENT ON COLUMN "menus"."updated_at" IS '更新时间';

COMMENT ON TABLE "role_menus" IS '角色-菜单权限（多对多）';
COMMENT ON COLUMN "role_menus"."role_id" IS '所属角色 ID';
COMMENT ON COLUMN "role_menus"."menu_id" IS '所属菜单 ID';
COMMENT ON COLUMN "role_menus"."created_at" IS '创建时间';
