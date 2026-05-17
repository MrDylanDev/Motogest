import { InternalServerErrorException } from '@nestjs/common';
import { TenantContext } from './tenant-context.service';

describe('TenantContext', () => {
  let sut: TenantContext;

  beforeEach(() => {
    sut = new TenantContext();
  });

  describe('access outside run()', () => {
    it('throws InternalServerErrorException when accessing tenantId without scope', () => {
      expect(() => sut.tenantId).toThrow(InternalServerErrorException);
      expect(() => sut.tenantId).toThrow(
        'TenantContext not initialized — request without tenant scope',
      );
    });

    it('throws InternalServerErrorException when accessing userId without scope', () => {
      expect(() => sut.userId).toThrow(InternalServerErrorException);
      expect(() => sut.userId).toThrow(
        'TenantContext not initialized — request without tenant scope',
      );
    });
  });

  describe('access within run()', () => {
    it('returns correct tenantId inside run()', () => {
      const result = sut.run(
        { tenantId: 'tenant-abc', userId: 'user-123' },
        () => sut.tenantId,
      );
      expect(result).toBe('tenant-abc');
    });

    it('returns correct userId inside run()', () => {
      const result = sut.run(
        { tenantId: 'tenant-abc', userId: 'user-456' },
        () => sut.userId,
      );
      expect(result).toBe('user-456');
    });
  });

  describe('isolation between run() calls', () => {
    it('each run() has its own isolated store', async () => {
      const results: string[] = [];

      await Promise.all([
        new Promise<void>((resolve) => {
          sut.run({ tenantId: 'tenant-A', userId: 'user-A' }, () => {
            results.push(sut.tenantId);
            resolve();
          });
        }),
        new Promise<void>((resolve) => {
          sut.run({ tenantId: 'tenant-B', userId: 'user-B' }, () => {
            results.push(sut.tenantId);
            resolve();
          });
        }),
      ]);

      expect(results).toContain('tenant-A');
      expect(results).toContain('tenant-B');
      expect(results).toHaveLength(2);
    });

    it('accessing after run() completes throws', () => {
      sut.run({ tenantId: 'tenant-X', userId: 'user-X' }, () => {
        // inside scope — fine
      });

      // outside scope — should throw
      expect(() => sut.tenantId).toThrow(InternalServerErrorException);
    });
  });
});
