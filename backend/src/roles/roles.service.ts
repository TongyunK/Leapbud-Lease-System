import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignRoleMenusDto, CreateRoleDto, SaveRoleMenuMatrixDto, UpdateRoleDto } from './dto/role.dto';
import { roleAuditInclude, toRoleDto } from './role.mapper';
import { buildMenuTree, menuAuditInclude } from '../menus/menu.mapper';
import { runBatchRemove } from '../common/batch-delete';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { keyword?: string; activeOnly?: boolean }) {
    const where: Prisma.RoleWhereInput = {};
    if (params.activeOnly) where.active = true;
    const keyword = params.keyword?.trim();
    if (keyword) {
      where.OR = [
        { code: { contains: keyword, mode: 'insensitive' } },
        { name: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.role.findMany({
      where,
      include: roleAuditInclude,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map(toRoleDto);
  }

  async findOne(id: string) {
    const row = await this.prisma.role.findUnique({
      where: { id },
      include: roleAuditInclude,
    });
    if (!row) throw new NotFoundException(`Role ${id} not found`);
    return toRoleDto(row);
  }

  async create(dto: CreateRoleDto, actor = '') {
    const code = dto.code.trim();
    const name = dto.name.trim();
    if (!code) throw new BadRequestException('Code is required');
    if (!name) throw new BadRequestException('Name is required');
    const actorId = actor || null;

    try {
      const row = await this.prisma.role.create({
        data: {
          code,
          name,
          description: dto.description?.trim() ?? '',
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
          isSystem: false,
          createdById: actorId,
          updatedById: actorId,
        },
        include: roleAuditInclude,
      });
      return toRoleDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Role code「${code}」already exists`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateRoleDto, actor = '') {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Role ${id} not found`);

    try {
      const row = await this.prisma.role.update({
        where: { id },
        data: {
          code: dto.code !== undefined ? dto.code.trim() : undefined,
          name: dto.name !== undefined ? dto.name.trim() : undefined,
          description: dto.description !== undefined ? dto.description.trim() : undefined,
          sortOrder: dto.sortOrder,
          active: dto.active,
          ...(actor ? { updatedById: actor } : {}),
        },
        include: roleAuditInclude,
      });
      return toRoleDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Role code「${dto.code?.trim()}」already exists`);
      }
      throw e;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Role ${id} not found`);
    if (existing.isSystem) {
      throw new BadRequestException('System role cannot be deleted');
    }
    const userCount = await this.prisma.user.count({ where: { role: existing.code } });
    if (userCount > 0) {
      throw new BadRequestException(`角色仍有 ${userCount} 个用户使用，无法删除`);
    }
    await this.prisma.role.delete({ where: { id } });
    return { success: true };
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }

  async getMenuIds(id: string) {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Role ${id} not found`);
    const rows = await this.prisma.roleMenu.findMany({
      where: { roleId: id },
      select: { menuId: true },
    });
    return { menuIds: rows.map((r) => r.menuId) };
  }

  async assignMenus(id: string, dto: AssignRoleMenusDto, actor = '') {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Role ${id} not found`);

    const menuIds = [...new Set((dto.menuIds || []).map((x) => x.trim()).filter(Boolean))];
    if (menuIds.length) {
      const count = await this.prisma.menu.count({ where: { id: { in: menuIds } } });
      if (count !== menuIds.length) {
        throw new BadRequestException('One or more menu ids are invalid');
      }
    }

    await this.prisma.$transaction([
      this.prisma.roleMenu.deleteMany({ where: { roleId: id } }),
      ...(menuIds.length
        ? [
            this.prisma.roleMenu.createMany({
              data: menuIds.map((menuId) => ({ roleId: id, menuId })),
            }),
          ]
        : []),
      this.prisma.role.update({
        where: { id },
        data: actor ? { updatedById: actor } : {},
      }),
    ]);

    return this.getMenuIds(id);
  }

  /** 菜单 × 角色 权限矩阵 */
  async getMenuMatrix() {
    const [roles, menus, links] = await Promise.all([
      this.prisma.role.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        select: { id: true, code: true, name: true, isSystem: true },
      }),
      this.prisma.menu.findMany({
        where: { active: true },
        include: menuAuditInclude,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.roleMenu.findMany({ select: { roleId: true, menuId: true } }),
    ]);

    const grants: Record<string, string[]> = {};
    for (const link of links) {
      (grants[link.roleId] ||= []).push(link.menuId);
    }

    return {
      roles,
      menus: buildMenuTree(menus),
      grants,
    };
  }

  async saveMenuMatrix(dto: SaveRoleMenuMatrixDto, actor = '') {
    const grants = dto.grants || [];
    const roleIds = grants.map((g) => g.roleId);
    if (roleIds.length) {
      const count = await this.prisma.role.count({ where: { id: { in: roleIds } } });
      if (count !== new Set(roleIds).size) {
        throw new BadRequestException('One or more role ids are invalid');
      }
    }

    const allMenuIds = [...new Set(grants.flatMap((g) => g.menuIds || []))];
    if (allMenuIds.length) {
      const count = await this.prisma.menu.count({ where: { id: { in: allMenuIds } } });
      if (count !== allMenuIds.length) {
        throw new BadRequestException('One or more menu ids are invalid');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const g of grants) {
        const menuIds = [...new Set((g.menuIds || []).map((x) => x.trim()).filter(Boolean))];
        await tx.roleMenu.deleteMany({ where: { roleId: g.roleId } });
        if (menuIds.length) {
          await tx.roleMenu.createMany({
            data: menuIds.map((menuId) => ({ roleId: g.roleId, menuId })),
          });
        }
        if (actor) {
          await tx.role.update({
            where: { id: g.roleId },
            data: { updatedById: actor },
          });
        }
      }
    });

    return this.getMenuMatrix();
  }
}
