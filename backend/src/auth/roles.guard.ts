import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import type { JwtPayload } from './jwt-auth.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;

    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const role = (req.user?.role || '').trim();
    if (!role) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // 精确匹配（如 admin）
    if (roles.includes(role as UserRole)) return true;

    // 控制器大量使用 @Roles(admin, user) 表示「已登录即可」；自定义角色按普通用户放行
    const allowsAnyAuthenticated =
      roles.includes(UserRole.admin) && roles.includes(UserRole.user);
    if (allowsAnyAuthenticated) return true;

    throw new ForbiddenException('Insufficient permissions');
  }
}
