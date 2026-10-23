import { Menu, MenuType } from '@prisma/client';
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit';

export type MenuWithAudit = Menu & {
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const menuAuditInclude = auditUserInclude;

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export type MenuDto = {
  id: string;
  parentId: string | null;
  type: MenuType;
  name: string;
  nameEn: string;
  nameKey: string;
  routeName: string;
  path: string;
  icon: string;
  sortOrder: number;
  active: boolean;
  permission: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  children?: MenuDto[];
};

export function toMenuDto(row: MenuWithAudit): MenuDto {
  return {
    id: row.id,
    parentId: row.parentId,
    type: row.type,
    name: row.name,
    nameEn: row.nameEn ?? '',
    nameKey: row.nameKey,
    routeName: row.routeName,
    path: row.path,
    icon: row.icon,
    sortOrder: row.sortOrder,
    active: row.active,
    permission: row.permission,
    createdBy: auditActorLabel(row.createdByUser),
    createdAt: formatDateTime(row.createdAt),
    updatedBy: auditActorLabel(row.updatedByUser),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export function buildMenuTree(rows: MenuWithAudit[]): MenuDto[] {
  const nodes = rows.map((r) => ({ ...toMenuDto(r), children: [] as MenuDto[] }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots: MenuDto[] = [];

  for (const node of nodes) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (list: MenuDto[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const item of list) {
      if (item.children?.length) sortRec(item.children);
      else delete item.children;
    }
  };
  sortRec(roots);
  return roots;
}
