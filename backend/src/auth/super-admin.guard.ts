import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isSuperAdminRole } from '../common/actor-role';
import type { JwtPayload } from './jwt-auth.guard';

/** 仅 superAdmin 角色可访问（大小写不敏感；admin 不可） */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (isSuperAdminRole(req.user?.role)) return true;
    throw new ForbiddenException('SuperAdmin only');
  }
}
