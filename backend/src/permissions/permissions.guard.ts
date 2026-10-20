import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './require-permissions.decorator';
import { PermissionsService } from './permissions.service';
import type { JwtPayload } from '../auth/jwt-auth.guard';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const role = (req.user?.role || '').trim();
    if (!role) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const codes = await this.permissionsService.getCodesForRole(role);
    const ok = required.some((code) => codes.includes(code));
    if (!ok) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
