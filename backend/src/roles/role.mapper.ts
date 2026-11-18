import { Role } from '@prisma/client';
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit';
import { isSuperAdminRole } from '../common/actor-role';
import { PERMISSION_CATALOG } from '../permissions/permission.catalog';

export type RoleWithAudit = Role & {
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
  _count?: { roleMenus?: number; rolePermissions?: number };
};

export const roleAuditInclude = {
  ...auditUserInclude,
  _count: { select: { roleMenus: true, rolePermissions: true } },
} as const;

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function toRoleDto(row: RoleWithAudit) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    active: row.active,
    isSystem: row.isSystem,
    menuCount: row._count?.roleMenus ?? 0,
    // superAdmin 不写 role_permissions，运行时视为全权限；列表显示目录总数（与抽屉「已选」一致）
    permissionCount: isSuperAdminRole(row.code)
      ? PERMISSION_CATALOG.length
      : (row._count?.rolePermissions ?? 0),
    createdBy: auditActorLabel(row.createdByUser),
    createdAt: formatDateTime(row.createdAt),
    updatedBy: auditActorLabel(row.updatedByUser),
    updatedAt: formatDateTime(row.updatedAt),
  };
}
