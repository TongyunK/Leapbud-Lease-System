import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isSuperAdminRole } from '../common/actor-role';
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

  /**
   * 将代码目录同步到 DB。
   * - superAdmin：运行时视为全权限，不依赖本表补齐
   * - admin：须由超级管理员在角色管理中授予，启动时不自动灌入全部
   * - user：仅补齐默认项（skipDuplicates，不覆盖已关掉的）
   */
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

    const user = await this.prisma.role.findUnique({ where: { code: 'user' } });
    if (user) {
      const ids = DEFAULT_USER_PERMISSION_CODES.map((c) => byCode.get(c)).filter(
        (id): id is string => Boolean(id),
      );
      if (ids.length) {
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
   * 当前没有任何「非 superAdmin」角色被授予的权限码（含 admin 也未授予）。
   * 用于前端超级管理员视角：仅超管可点的功能按钮加发光描边。
   */
  async getAdminExclusiveCodes(): Promise<string[]> {
    const cached = this.adminExclusiveCache;
    if (cached && Date.now() - cached.at < PermissionsService.CACHE_TTL_MS) {
      return cached.codes;
    }

    const exclusive = await this.prisma.permission.findMany({
      where: {
        rolePermissions: {
          none: {
            role: {
              // superAdmin 权限不依赖绑定表；任一其它角色有绑定则不算独占
              code: { notIn: ['superAdmin'] },
            },
          },
        },
      },
      select: { code: true },
      orderBy: { sortOrder: 'asc' },
    });
    const codes = exclusive.map((p) => p.code);
    this.adminExclusiveCache = { codes, at: Date.now() };
    return codes;
  }

  /** 仅 superAdmin 视为拥有目录内全部权限；admin / 其他角色读角色权限表 */
  async getCodesForRole(roleCode: string): Promise<string[]> {
    const code = (roleCode || '').trim();
    if (!code) return [];

    if (isSuperAdminRole(code)) {
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

  /**
   * 权限目录（按模块分组）。
   * @param allowedCodes 若传入，仅返回这些码（空模块省略）；用于管理员视角：只看到自身已有权限
   */
  catalogGrouped(allowedCodes?: string[] | null) {
    const allow = allowedCodes ? new Set(allowedCodes) : null;
    const byModule = new Map<
      string,
      { module: string; moduleName: string; items: typeof PERMISSION_CATALOG }
    >();
    for (const m of PERMISSION_MODULES) {
      byModule.set(m.module, {
        module: m.module,
        moduleName: m.moduleName,
        items: [],
      });
    }
    for (const p of PERMISSION_CATALOG) {
      if (allow && !allow.has(p.code)) continue;
      const g = byModule.get(p.module);
      if (g) g.items.push(p);
    }
    return [...byModule.values()].filter((g) => g.items.length > 0);
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
    // 仅 superAdmin：视为拥有目录内全部权限（不依赖绑定表）
    if (isSuperAdminRole(role.code)) {
      return PERMISSION_CATALOG.map((p) => p.code);
    }
    return role.rolePermissions.map((rp) => rp.permission.code);
  }

  /**
   * 分配角色功能权限。
   * - 不可改 superAdmin（始终全权限）
   * - 改 admin 角色：仅超级管理员可操作
   * - 非超级管理员：只能勾选自身已有权限；目标角色上「操作者没有」的权限码原样保留（避免误清）
   */
  async assignCodesByRoleId(roleId: string, codes: string[], actorRole?: string | null) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException(`Role ${roleId} not found`);

    if (isSuperAdminRole(role.code)) {
      throw new ForbiddenException('超级管理员角色默认拥有全部功能权限，无需配置');
    }
    if (role.code === 'admin' && !isSuperAdminRole(actorRole)) {
      throw new ForbiddenException('仅超级管理员可为管理员角色配置功能权限');
    }

    let unique = [...new Set((codes ?? []).map((c) => c.trim()).filter(Boolean))];

    if (!isSuperAdminRole(actorRole)) {
      const actorCodes = new Set(await this.getCodesForRole((actorRole || '').trim()));
      const beyond = unique.filter((c) => !actorCodes.has(c));
      if (beyond.length) {
        throw new ForbiddenException('只能分配自身已有的功能权限');
      }
      const existingRows = await this.prisma.rolePermission.findMany({
        where: { roleId },
        select: { permission: { select: { code: true } } },
      });
      const preserved = existingRows
        .map((rp) => rp.permission.code)
        .filter((c) => !actorCodes.has(c));
      unique = [...new Set([...preserved, ...unique])];
    }

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
