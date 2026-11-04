import { splitEmptyFilter } from './column-filter';

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

/**
 * Prisma User 条件：匹配 auditActorLabel 展示文案（有 displayName 用显示名，否则用账号）。
 */
export function userWhereActorLabels(labels: string[]): {
  OR: Array<
    | { displayName: { in: string[] } }
    | { AND: [{ displayName: string }, { account: { in: string[] } }] }
  >;
} {
  const cleaned = [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
  return {
    OR: [
      { displayName: { in: cleaned } },
      { AND: [{ displayName: '' }, { account: { in: cleaned } }] },
    ],
  };
}

/**
 * 列表筛创建人 / 更新人 / 销售经理 / 经办人等：匹配展示文案，并可叠加 FK 为空。
 *
 * @param fieldPrefix 如 `createdBy` → `createdByUser` + `createdById`；
 *   `salesManager` → `salesManagerUser` + `salesManagerId`；
 *   `handler` → `handlerUser` + `handlerId`；
 *   `accountManager` → `accountManagerUser` + `accountManagerId`
 * @returns 可直接放入 where.AND 的子句；无条件时返回 null
 *
 * @example
 * const clause = actorLabelsOrEmpty('createdBy', params.createdBys)
 * if (clause) and.push(clause)
 */
export function actorLabelsOrEmpty(
  fieldPrefix: string,
  labels?: string[] | null,
): Record<string, unknown> | null {
  const { values, includeEmpty } = splitEmptyFilter(labels);
  if (!values.length && !includeEmpty) return null;
  const userField = `${fieldPrefix}User`;
  const idField = `${fieldPrefix}Id`;
  const or: Record<string, unknown>[] = [];
  if (values.length) or.push({ [userField]: userWhereActorLabels(values) });
  if (includeEmpty) or.push({ [idField]: null });
  return or.length === 1 ? or[0]! : { OR: or };
}

/**
 * 同 actorLabelsOrEmpty，显式传入 relation / FK 字段名。
 * relationField 如 createdByUser；fkField 如 createdById。
 */
export function actorRelationInOrEmpty(
  relationField: string,
  fkField: string,
  labels?: string[] | null,
): Record<string, unknown> | null {
  const { values, includeEmpty } = splitEmptyFilter(labels);
  if (!values.length && !includeEmpty) return null;
  const or: Record<string, unknown>[] = [];
  if (values.length) or.push({ [relationField]: userWhereActorLabels(values) });
  if (includeEmpty) or.push({ [fkField]: null });
  return or.length === 1 ? or[0]! : { OR: or };
}
