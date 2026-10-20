import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_USER_PERMISSION_CODES,
  PERMISSION_CATALOG,
  PERMISSION_MODULES,
} from './permission.catalog';

@Injectable()
export class PermissionsService implements OnModuleInit {
  private readonly logger = new Logger(PermissionsService.name);
  /** roleCode -> permission codes（进程内短缓存） */
  private roleCodeCache = new Map<string, { codes: string[]; at: number }>();
  /** 仅 admin 拥有的权限码缓存（无其它角色被授予） */
  private adminExclusiveCache: { codes: string[]; at: number } | null = null;
  private static readonly CACHE_TTL_MS = 15_000;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.syncCatalog();
    } catch (e) {
      this.logger.warn(`Permission catalog sync skipped: ${(e as Error).message}`);
    }
  }

  /** 将代码目录同步到 DB；admin 补齐全部；user 仅首次补齐默认项 */
  async syncCatalog() {
    for (const def of PERMISSION_CATALOG) {
      await this.prisma.permission.upsert({
        where: { code: def.code },
        create: {
          code: def.code,
          module: def.module,
          action: def.action,
          name: def.name,
          sortOrder: def.sortOrder,
        },
        update: {
          module: def.module,
          action: def.action,
          name: def.name,
          sortOrder: def.sortOrder,
        },
      });
    }

    const all = await this.prisma.permission.findMany({ select: { id: true, code: true } });
    const byCode = new Map(all.map((p) => [p.code, p.id]));

    const admin = await this.prisma.role.findUnique({ where: { code: 'admin' } });
    if (admin) {
      await this.prisma.rolePermission.createMany({
        data: all.map((p) => ({ roleId: admin.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }

    const user = await this.prisma.role.findUnique({ where: { code: 'user' } });
    if (user) {
      const ids = DEFAULT_USER_PERMISSION_CODES.map((c) => byCode.get(c)).filter(
        (id): id is string => Boolean(id),
      );
      if (ids.length) {
        // 仅补齐缺省项，不覆盖管理员在角色里手动关掉的权限之外的新增模块默认项
        await this.prisma.rolePermission.createMany({
          data: ids.map((permissionId) => ({ roleId: user.id, permissionId })),
          skipDuplicates: true,
        });
      }
    }

    this.roleCodeCache.clear();
    this.adminExclusiveCache = null;
  }

  invalidateCache(roleCode?: string) {
    if (roleCode) this.roleCodeCache.delete(roleCode);
    else this.roleCodeCache.clear();
    this.adminExclusiveCache = null;
  }

  /**
   * 当前没有任何「非 admin」角色被授予的权限码。
   * 用于前端 admin 视角：仅管理员可点的功能按钮加发光描边。
   */
  async getAdminExclusiveCodes(): Promise<string[]> {
    const cached = this.adminExclusiveCache;
    if (cached && Date.now() - cached.at < PermissionsService.CACHE_TTL_MS) {
      return cached.codes;
    }

    const exclusive = await this.prisma.permission.findMany({
      where: {
        rolePermissions: {
          none: { role: { code: { not: 'admin' } } },
        },
      },
      select: { code: true },
      orderBy: { sortOrder: 'asc' },
    });
    const codes = exclusive.map((p) => p.code);
    this.adminExclusiveCache = { codes, at: Date.now() };
    return codes;
  }

  /** admin 视为拥有目录内全部权限 */
  async getCodesForRole(roleCode: string): Promise<string[]> {
    const code = (roleCode || '').trim();
    if (!code) return [];

    if (code === 'admin') {
      return PERMISSION_CATALOG.map((p) => p.code);
    }

    const cached = this.roleCodeCache.get(code);
    if (cached && Date.now() - cached.at < PermissionsService.CACHE_TTL_MS) {
      return cached.codes;
    }

    const role = await this.prisma.role.findUnique({
      where: { code },
      select: {
        rolePermissions: { select: { permission: { select: { code: true } } } },
      },
    });
    const codes = (role?.rolePermissions ?? []).map((rp) => rp.permission.code);
    this.roleCodeCache.set(code, { codes, at: Date.now() });
    return codes;
  }

  async getCodesForUserId(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) return [];
    return this.getCodesForRole(user.role);
  }

  catalogGrouped() {
    const byModule = new Map<string, { module: string; moduleName: string; items: typeof PERMISSION_CATALOG }>();
    for (const m of PERMISSION_MODULES) {
      byModule.set(m.module, {
        module: m.module,
        moduleName: m.moduleName,
        items: [],
      });
    }
    for (const p of PERMISSION_CATALOG) {
      const g = byModule.get(p.module);
      if (g) g.items.push(p);
    }
    return [...byModule.values()];
  }

  async listAll() {
    return this.prisma.permission.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async getCodesByRoleId(roleId: string): Promise<string[]> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: {
        code: true,
        rolePermissions: { select: { permission: { select: { code: true } } } },
      },
    });
    if (!role) throw new NotFoundException(`Role ${roleId} not found`);
    if (role.code === 'admin') return PERMISSION_CATALOG.map((p) => p.code);
    return role.rolePermissions.map((rp) => rp.permission.code);
  }

  async assignCodesByRoleId(roleId: string, codes: string[]) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException(`Role ${roleId} not found`);

    const unique = [...new Set((codes ?? []).map((c) => c.trim()).filter(Boolean))];
    const perms = await this.prisma.permission.findMany({
      where: { code: { in: unique } },
      select: { id: true, code: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (perms.length) {
        await tx.rolePermission.createMany({
          data: perms.map((p) => ({ roleId, permissionId: p.id })),
        });
      }
    });

    this.invalidateCache(role.code);
    return { roleId, codes: perms.map((p) => p.code) };
  }
}
