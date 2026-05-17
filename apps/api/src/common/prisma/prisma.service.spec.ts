import { InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

// Mock TenantContext
class MockTenantContext {
  private _tenantId: string | null = TENANT_ID;

  get tenantId(): string {
    if (!this._tenantId) {
      throw new InternalServerErrorException(
        'TenantContext not initialized — request without tenant scope',
      );
    }
    return this._tenantId;
  }

  simulateNoScope(): void {
    this._tenantId = null;
  }

  simulateInvalidUuid(): void {
    this._tenantId = 'not-a-valid-uuid';
  }
}

/**
 * Helper: captures the $allOperations callback from $extends
 * so we can invoke it directly with simulated args.
 */
function captureExtensionCallback(
  service: PrismaService,
): (params: {
  model: string;
  operation: string;
  args: Record<string, unknown>;
  query: jest.Mock;
}) => Promise<unknown> {
  const extendsSpy = jest
    .spyOn(service, '$extends')
    .mockImplementation((ext: unknown) => {
      return ext as ReturnType<typeof service.$extends>;
    });

  service.scoped();

  const extensionArg = extendsSpy.mock.calls[0][0] as {
    query: {
      $allModels: { $allOperations: (...args: unknown[]) => Promise<unknown> };
    };
  };

  extendsSpy.mockRestore();
  return extensionArg.query.$allModels.$allOperations as (params: {
    model: string;
    operation: string;
    args: Record<string, unknown>;
    query: jest.Mock;
  }) => Promise<unknown>;
}

describe('PrismaService', () => {
  let service: PrismaService;
  let tenantContext: MockTenantContext;

  beforeEach(() => {
    tenantContext = new MockTenantContext();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new PrismaService(tenantContext as any);
    // Mock lifecycle methods to avoid real DB connections
    jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);
  });

  describe('scoped() — read operations', () => {
    it('findMany filters by tenantId for tenant-scoped model', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue([]);
      const args: Record<string, unknown> = { where: { status: 'active' } };

      await allOps({ model: 'AuditLog', operation: 'findMany', args, query });

      expect(query).toHaveBeenCalledWith({
        where: { status: 'active', tenantId: TENANT_ID },
      });
    });

    it('findUnique filters by tenantId for tenant-scoped model', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue(null);
      const args: Record<string, unknown> = { where: { id: '123' } };

      await allOps({
        model: 'Subscription',
        operation: 'findUnique',
        args,
        query,
      });

      expect(query).toHaveBeenCalledWith({
        where: { id: '123', tenantId: TENANT_ID },
      });
    });

    it('findFirst filters by tenantId for tenant-scoped model', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue(null);
      const args: Record<string, unknown> = { where: {} };

      await allOps({
        model: 'UserTenant',
        operation: 'findFirst',
        args,
        query,
      });

      expect(query).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
      });
    });

    it('count filters by tenantId for tenant-scoped model', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue(5);
      const args: Record<string, unknown> = { where: { role: 'admin' } };

      await allOps({ model: 'UserTenant', operation: 'count', args, query });

      expect(query).toHaveBeenCalledWith({
        where: { role: 'admin', tenantId: TENANT_ID },
      });
    });

    it('aggregate filters by tenantId for tenant-scoped model', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue({});
      const args: Record<string, unknown> = { where: {} };

      await allOps({
        model: 'Subscription',
        operation: 'aggregate',
        args,
        query,
      });

      expect(query).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
      });
    });
  });

  describe('scoped() — create operations', () => {
    it('create injects tenantId in data', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue({ id: '1' });
      const args: Record<string, unknown> = { data: { action: 'login' } };

      await allOps({ model: 'AuditLog', operation: 'create', args, query });

      expect(query).toHaveBeenCalledWith({
        data: { action: 'login', tenantId: TENANT_ID },
      });
    });

    it('createMany injects tenantId in each element of data array', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue({ count: 2 });
      const args: Record<string, unknown> = {
        data: [{ action: 'login' }, { action: 'logout' }],
      };

      await allOps({ model: 'AuditLog', operation: 'createMany', args, query });

      expect(query).toHaveBeenCalledWith({
        data: [
          { action: 'login', tenantId: TENANT_ID },
          { action: 'logout', tenantId: TENANT_ID },
        ],
      });
    });

    it('createMany injects tenantId in single data object', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue({ count: 1 });
      const args: Record<string, unknown> = { data: { action: 'signup' } };

      await allOps({ model: 'AuditLog', operation: 'createMany', args, query });

      expect(query).toHaveBeenCalledWith({
        data: { action: 'signup', tenantId: TENANT_ID },
      });
    });
  });

  describe('scoped() — update/delete operations', () => {
    it('updateMany forces where.tenantId', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue({ count: 1 });
      const args: Record<string, unknown> = {
        where: { status: 'old' },
        data: { status: 'new' },
      };

      await allOps({
        model: 'Subscription',
        operation: 'updateMany',
        args,
        query,
      });

      expect(query).toHaveBeenCalledWith({
        where: { status: 'old', tenantId: TENANT_ID },
        data: { status: 'new' },
      });
    });

    it('deleteMany forces where.tenantId', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue({ count: 1 });
      const args: Record<string, unknown> = { where: { expired: true } };

      await allOps({
        model: 'Subscription',
        operation: 'deleteMany',
        args,
        query,
      });

      expect(query).toHaveBeenCalledWith({
        where: { expired: true, tenantId: TENANT_ID },
      });
    });

    it('update forces where.tenantId', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue({ id: '1' });
      const args: Record<string, unknown> = {
        where: { id: '1' },
        data: { role: 'admin' },
      };

      await allOps({ model: 'UserTenant', operation: 'update', args, query });

      expect(query).toHaveBeenCalledWith({
        where: { id: '1', tenantId: TENANT_ID },
        data: { role: 'admin' },
      });
    });

    it('delete forces where.tenantId', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue({ id: '1' });
      const args: Record<string, unknown> = { where: { id: '1' } };

      await allOps({ model: 'AuditLog', operation: 'delete', args, query });

      expect(query).toHaveBeenCalledWith({
        where: { id: '1', tenantId: TENANT_ID },
      });
    });
  });

  describe('scoped() — global/unknown models bypass', () => {
    it('global model (User) is NOT filtered by tenantId', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue([]);
      const args: Record<string, unknown> = {
        where: { email: 'test@test.com' },
      };

      await allOps({ model: 'User', operation: 'findMany', args, query });

      expect(query).toHaveBeenCalledWith({
        where: { email: 'test@test.com' },
      });
    });

    it('unknown model is NOT filtered by tenantId', async () => {
      const allOps = captureExtensionCallback(service);
      const query = jest.fn().mockResolvedValue(null);
      const args: Record<string, unknown> = { where: { key: 'value' } };

      await allOps({
        model: 'SomeOtherModel',
        operation: 'findFirst',
        args,
        query,
      });

      expect(query).toHaveBeenCalledWith({
        where: { key: 'value' },
      });
    });
  });

  describe('withRlsTransaction()', () => {
    it('sets app.tenant_id via $executeRawUnsafe with correct UUID', async () => {
      const executeRawUnsafe = jest.fn().mockResolvedValue(undefined);
      const mockTx = { $executeRawUnsafe: executeRawUnsafe };

      jest
        .spyOn(service, '$transaction')
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn(mockTx),
        );

      const result = await service.withRlsTransaction(async () => {
        return 'done';
      });

      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
      );
      expect(result).toBe('done');
    });

    it('throws if tenantId is not a valid UUID (defense in depth)', async () => {
      tenantContext.simulateInvalidUuid();

      jest
        .spyOn(service, '$transaction')
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({ $executeRawUnsafe: jest.fn() }),
        );

      await expect(service.withRlsTransaction(async () => 'x')).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.withRlsTransaction(async () => 'x')).rejects.toThrow(
        'Invalid tenantId in TenantContext',
      );
    });
  });

  describe('scoped() — error propagation', () => {
    it('propagates InternalServerErrorException when no tenant scope', () => {
      tenantContext.simulateNoScope();

      expect(() => service.scoped()).toThrow(InternalServerErrorException);
    });
  });
});
