import { AsyncLocalStorage } from 'async_hooks';
import type { JwtPayload } from '../auth/jwt-auth.guard';

export type BuildingRequestContext = {
  actor?: JwtPayload;
  /** 顶栏当前大厦；空表示「我可访问的全部」 */
  buildingId?: string;
  allowedIds?: string[] | null;
};

export const buildingContext = new AsyncLocalStorage<BuildingRequestContext>();
