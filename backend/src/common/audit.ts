/** 审计关联用户的精简字段（列表/详情展示用） */
export const auditUserSelect = {
  id: true,
  account: true,
  displayName: true,
} as const;

export type AuditUserRef = {
  id: string;
  account: string;
  displayName: string;
};

/** Prisma include：创建人 / 更新人 */
export const auditUserInclude = {
  createdByUser: { select: auditUserSelect },
  updatedByUser: { select: auditUserSelect },
} as const;

/** API 展示：优先显示名，否则账号；无关联时为空串 */
export function auditActorLabel(user?: AuditUserRef | null): string {
  if (!user) return '';
  const name = user.displayName?.trim();
  return name || user.account;
}
