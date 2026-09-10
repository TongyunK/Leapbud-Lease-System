import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuDto, UpdateMenuDto } from './dto/menu.dto';
import { buildMenuTree, menuAuditInclude, toMenuDto, type MenuDto } from './menu.mapper';

function pruneEmptyDirectories(nodes: MenuDto[]): MenuDto[] {
  return nodes
    .map((n) => {
      const children = n.children?.length ? pruneEmptyDirectories(n.children) : undefined;
      return { ...n, children };
    })
    .filter((n) => {
      if (n.type === 'directory') return Boolean(n.children?.length);
      return true;
    })
    .map((n) => {
      if (!n.children?.length) {
        const { children: _c, ...rest } = n;
        return rest;
      }
      return n;
    });
}

@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { activeOnly?: boolean; flat?: boolean }) {
    const where: Prisma.MenuWhereInput = {};
    if (params.activeOnly) where.active = true;

    const rows = await this.prisma.menu.findMany({
      where,
      include: menuAuditInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    if (params.flat) return rows.map(toMenuDto);
    return buildMenuTree(rows);
  }

  /**
   * 当前角色侧栏菜单：按 role_menus 授权，并补齐祖先目录；仅 active。
   */
  async findNavTreeForRole(roleCode: string): Promise<MenuDto[]> {
    const code = (roleCode || '').trim();
    if (!code) return [];

    const role = await this.prisma.role.findFirst({
      where: { code, active: true },
      include: { roleMenus: { select: { menuId: true } } },
    });
    if (!role) return [];

    const assignedIds = new Set(role.roleMenus.map((r) => r.menuId));
    if (!assignedIds.size) return [];

    const all = await this.prisma.menu.findMany({
      where: { active: true },
      include: menuAuditInclude,
    });
    const byId = new Map(all.map((m) => [m.id, m]));

    const keep = new Set<string>();
    for (const id of assignedIds) {
      let cur = byId.get(id);
      while (cur) {
        keep.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
    }

    const rows = all.filter((m) => keep.has(m.id));
    return pruneEmptyDirectories(buildMenuTree(rows));
  }

  async findOne(id: string) {
    const row = await this.prisma.menu.findUnique({
      where: { id },
      include: menuAuditInclude,
    });
    if (!row) throw new NotFoundException(`Menu ${id} not found`);
    return toMenuDto(row);
  }

  private async assertParent(parentId: string | null | undefined) {
    if (!parentId) return;
    const parent = await this.prisma.menu.findUnique({ where: { id: parentId } });
    if (!parent) throw new BadRequestException('Parent menu not found');
  }

  async create(dto: CreateMenuDto, actor = '') {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const parentId = dto.parentId?.trim() || null;
    await this.assertParent(parentId);
    const actorId = actor || null;

    const row = await this.prisma.menu.create({
      data: {
        parentId,
        type: dto.type,
        name,
        nameKey: dto.nameKey?.trim() ?? '',
        routeName: dto.routeName?.trim() ?? '',
        path: dto.path?.trim() ?? '',
        icon: dto.icon?.trim() ?? '',
        sortOrder: dto.sortOrder ?? 0,
        active: dto.active ?? true,
        permission: dto.permission?.trim() ?? '',
        createdById: actorId,
        updatedById: actorId,
      },
      include: menuAuditInclude,
    });
    return toMenuDto(row);
  }

  async update(id: string, dto: UpdateMenuDto, actor = '') {
    const existing = await this.prisma.menu.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Menu ${id} not found`);

    let parentId: string | null | undefined = undefined;
    if (dto.parentId !== undefined) {
      parentId = dto.parentId?.trim() || null;
      if (parentId === id) throw new BadRequestException('Menu cannot be its own parent');
      await this.assertParent(parentId);
      if (parentId) {
        const descendants = await this.collectDescendantIds(id);
        if (descendants.has(parentId)) {
          throw new BadRequestException('Cannot move menu under its descendant');
        }
      }
    }

    const row = await this.prisma.menu.update({
      where: { id },
      data: {
        parentId,
        type: dto.type,
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        nameKey: dto.nameKey !== undefined ? dto.nameKey.trim() : undefined,
        routeName: dto.routeName !== undefined ? dto.routeName.trim() : undefined,
        path: dto.path !== undefined ? dto.path.trim() : undefined,
        icon: dto.icon !== undefined ? dto.icon.trim() : undefined,
        sortOrder: dto.sortOrder,
        active: dto.active,
        permission: dto.permission !== undefined ? dto.permission.trim() : undefined,
        ...(actor ? { updatedById: actor } : {}),
      },
      include: menuAuditInclude,
    });
    return toMenuDto(row);
  }

  private async collectDescendantIds(rootId: string): Promise<Set<string>> {
    const all = await this.prisma.menu.findMany({ select: { id: true, parentId: true } });
    const childrenMap = new Map<string, string[]>();
    for (const row of all) {
      if (!row.parentId) continue;
      const list = childrenMap.get(row.parentId) || [];
      list.push(row.id);
      childrenMap.set(row.parentId, list);
    }
    const out = new Set<string>();
    const stack = [...(childrenMap.get(rootId) || [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (out.has(id)) continue;
      out.add(id);
      stack.push(...(childrenMap.get(id) || []));
    }
    return out;
  }

  async remove(id: string) {
    const existing = await this.prisma.menu.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Menu ${id} not found`);
    await this.prisma.menu.delete({ where: { id } });
    return { success: true };
  }
}
