/** 角色编码规范化（去空白、小写） */
export function normalizeRoleCode(role?: string | null): string {
  return String(role || '')
    .trim()
    .toLowerCase();
}

/** superAdmin（大小写不敏感） */
export function isSuperAdminRole(role?: string | null): boolean {
  return normalizeRoleCode(role) === 'superadmin';}

/**
 * 系统级管理员：admin 或 superAdmin（默认全大厦访问等）。
 * 注意：功能按钮权限仅 superAdmin 默认全开；admin 须在角色管理中配置。
 */
export function isElevatedAdminRole(role?: string | null): boolean {
  const r = normalizeRoleCode(role);
  return r === 'admin' || r === 'superadmin';
}
