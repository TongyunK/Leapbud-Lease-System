import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from './jwt-auth.guard';

/** 当前登录用户 JWT payload；未登录时为 undefined */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload | undefined => {
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    return req.user;
  },
);

export function actorAccount(user?: JwtPayload | null): string {
  return user?.account?.trim() || '';
}
