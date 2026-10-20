import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/** 要求具备所列权限之一（OR）；admin 角色始终放行 */
export const RequirePermissions = (...codes: string[]) =>
  SetMetadata(PERMISSIONS_KEY, codes);
