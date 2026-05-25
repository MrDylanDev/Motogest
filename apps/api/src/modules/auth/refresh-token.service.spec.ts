import { Test } from '@nestjs/testing';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;

  const mockPrisma = {
    refreshToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockJwt = { signAsync: jest.fn().mockResolvedValue('new-access-token') };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get(RefreshTokenService);
    jest.clearAllMocks();
  });

  describe('rotate', () => {
    it('returns new token pair and invalidates old', async () => {
      const storedToken = {
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'fam-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      };
      mockPrisma.refreshToken.findFirst.mockResolvedValue(storedToken);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        tenants: [{ tenantId: 'tenant-1', role: 'admin_taller' }],
      });

      const result = await service.rotate('valid-token-hash');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('revokes entire family on reuse (theft detection)', async () => {
      const revokedToken = {
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'fam-1',
        revokedAt: new Date(), // already revoked = reuse attempt
        expiresAt: new Date(Date.now() + 60000),
      };
      mockPrisma.refreshToken.findFirst.mockResolvedValue(revokedToken);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await expect(service.rotate('reused-token')).rejects.toThrow(
        UnauthorizedException,
      );
      // Verify family revocation
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: 'fam-1', revokedAt: null },
        }),
      );
    });
  });
});
