import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { buildingContext } from './building-context';

@Injectable()
export class BuildingContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      query?: { buildingId?: unknown };
    }>();
    const raw = req.query?.buildingId;
    const buildingId = typeof raw === 'string' ? raw.trim() : '';
    const store = {
      actor: req.user,
      buildingId: buildingId || undefined,
    };
    return new Observable((subscriber) => {
      buildingContext.run(store, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
