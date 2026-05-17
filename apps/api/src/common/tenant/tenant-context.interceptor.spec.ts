import { UnauthorizedException } from '@nestjs/common';
import { Observable, firstValueFrom, of } from 'rxjs';
import { TenantContext } from './tenant-context.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';

describe('TenantContextInterceptor', () => {
  let interceptor: TenantContextInterceptor;
  let tenantContext: TenantContext;

  beforeEach(() => {
    tenantContext = new TenantContext();
    interceptor = new TenantContextInterceptor(tenantContext);
  });

  function mockExecutionContext(user: unknown) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  function mockCallHandler(returnValue: unknown = { ok: true }) {
    return {
      handle: () => of(returnValue),
    } as any;
  }

  describe('rejects unauthorized requests', () => {
    it('throws 401 when req.user is undefined', async () => {
      const ctx = mockExecutionContext(undefined);
      const handler = mockCallHandler();

      expect(() => interceptor.intercept(ctx, handler)).toThrow(
        UnauthorizedException,
      );
    });

    it('throws 401 when req.user is null', async () => {
      const ctx = mockExecutionContext(null);
      const handler = mockCallHandler();

      expect(() => interceptor.intercept(ctx, handler)).toThrow(
        UnauthorizedException,
      );
    });

    it('throws 401 when req.user.tenantId is missing', async () => {
      const ctx = mockExecutionContext({ id: 'user-1' });
      const handler = mockCallHandler();

      expect(() => interceptor.intercept(ctx, handler)).toThrow(
        UnauthorizedException,
      );
    });

    it('throws 401 when req.user.id is missing', async () => {
      const ctx = mockExecutionContext({
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
      });
      const handler = mockCallHandler();

      expect(() => interceptor.intercept(ctx, handler)).toThrow(
        UnauthorizedException,
      );
    });

    it('throws 401 when tenantId is not a valid UUID', async () => {
      const ctx = mockExecutionContext({
        id: 'user-1',
        tenantId: 'not-a-uuid',
      });
      const handler = mockCallHandler();

      expect(() => interceptor.intercept(ctx, handler)).toThrow(
        UnauthorizedException,
      );
    });

    it('throws 401 when tenantId is a partial UUID', async () => {
      const ctx = mockExecutionContext({
        id: 'user-1',
        tenantId: '550e8400-e29b-41d4-a716',
      });
      const handler = mockCallHandler();

      expect(() => interceptor.intercept(ctx, handler)).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('happy path — sets tenant scope', () => {
    const validTenantId = '550e8400-e29b-41d4-a716-446655440000';
    const validUserId = 'user-abc-123';

    it('passes through handler response within tenant scope', async () => {
      const ctx = mockExecutionContext({
        id: validUserId,
        tenantId: validTenantId,
      });
      const handler = mockCallHandler({ data: 'response' });

      const result$ = interceptor.intercept(ctx, handler);
      const result = await firstValueFrom(result$ as Observable<unknown>);

      expect(result).toEqual({ data: 'response' });
    });

    it('sets tenantId accessible via TenantContext inside handler', async () => {
      let capturedTenantId: string | undefined;

      const ctx = mockExecutionContext({
        id: validUserId,
        tenantId: validTenantId,
      });
      const handler = {
        handle: () =>
          new Observable((subscriber) => {
            capturedTenantId = tenantContext.tenantId;
            subscriber.next('ok');
            subscriber.complete();
          }),
      } as any;

      const result$ = interceptor.intercept(ctx, handler);
      await firstValueFrom(result$ as Observable<unknown>);

      expect(capturedTenantId).toBe(validTenantId);
    });

    it('sets userId accessible via TenantContext inside handler', async () => {
      let capturedUserId: string | undefined;

      const ctx = mockExecutionContext({
        id: validUserId,
        tenantId: validTenantId,
      });
      const handler = {
        handle: () =>
          new Observable((subscriber) => {
            capturedUserId = tenantContext.userId;
            subscriber.next('ok');
            subscriber.complete();
          }),
      } as any;

      const result$ = interceptor.intercept(ctx, handler);
      await firstValueFrom(result$ as Observable<unknown>);

      expect(capturedUserId).toBe(validUserId);
    });
  });
});
