import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { TenantContext } from './tenant-context.service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
}

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Missing user context');
    }

    const { tenantId, id: userId } = user;

    if (!tenantId || !UUID_REGEX.test(tenantId)) {
      throw new UnauthorizedException('Invalid or missing tenantId');
    }

    if (!userId) {
      throw new UnauthorizedException('Missing userId');
    }

    return new Observable((subscriber) => {
      const subscription = this.tenantContext.run({ tenantId, userId }, () =>
        next.handle().subscribe({
          next: (val) => subscriber.next(val),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        }),
      );

      return () => subscription.unsubscribe();
    });
  }
}
