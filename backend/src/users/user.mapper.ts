import { User } from '@prisma/client';
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit';

export type UserWithAudit = User & {
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
  assignedRole?: { code: string; name: string } | null;
  userBuildings?: Array<{ building: { id: string; name: string } }>;
};

export const userAuditInclude = {
  ...auditUserInclude,
  assignedRole: { select: { code: true, name: true } },
  userBuildings: {
    include: { building: { select: { id: true, name: true } } },
  },
};

/** 对齐前端用户列表 / 登录返回（不含密码） */
export function toUserDto(user: UserWithAudit) {
  const buildings = (user.userBuildings ?? [])
    .map((row) => ({
      id: row.building.id,
      name: row.building.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  return {
    id: user.id,
    account: user.account,
    displayName: user.displayName,
    role: user.role,
    roleName: user.assignedRole?.name || user.role,
    roles: [user.role],
    status: user.status,
    phone: user.phone,
    email: user.email,
    buildingIds: buildings.map((b) => b.id),
    buildings,
    lastLoginAt: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '',
    failedLoginCount: user.failedLoginCount ?? 0,
    loginLockedUntil: user.loginLockedUntil ? formatDateTime(user.loginLockedUntil) : null,
    /** 当前是否仍在登录冷却锁定中 */
    loginLocked: Boolean(user.loginLockedUntil && user.loginLockedUntil.getTime() > Date.now()),
    /** 距自动解锁剩余分钟（向上取整；未锁定为 null） */
    loginLockedRemainingMinutes: remainingLockMinutes(user.loginLockedUntil),
    createdBy: auditActorLabel(user.createdByUser),
    createdAt: formatDateTime(user.createdAt),
    updatedBy: auditActorLabel(user.updatedByUser),
    updatedAt: formatDateTime(user.updatedAt),
  };
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function remainingLockMinutes(until: Date | null | undefined): number | null {
  if (!until) return null;
  const ms = until.getTime() - Date.now();
  if (ms <= 0) return null;
  return Math.max(1, Math.ceil(ms / 60_000));
}
