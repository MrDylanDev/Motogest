import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;

  const mockPrisma = {
    emailVerification: { findFirst: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() },
    tenant: { update: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(EmailVerificationService);
    jest.clearAllMocks();
  });

  describe('verify', () => {
    it('sets emailVerified=true and tenant status=active for valid token', async () => {
      const record = {
        id: 'ver-1',
        userId: 'user-1',
        token: 'valid-token',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
        user: { tenants: [{ tenantId: 'tenant-1' }] },
      };

      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.emailVerification.findFirst.mockResolvedValue(record);
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.tenant.update.mockResolvedValue({});

      await service.verify('valid-token');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerified: true, status: 'active' },
      });
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
        data: { status: 'active' },
      });
    });

    it('throws BadRequestException for expired token', async () => {
      const record = {
        id: 'ver-1',
        userId: 'user-1',
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 60000),
        usedAt: null,
        user: { tenants: [{ tenantId: 'tenant-1' }] },
      };

      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.emailVerification.findFirst.mockResolvedValue(record);

      await expect(service.verify('expired-token')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verify('expired-token')).rejects.toThrow(
        'EMAIL_VERIFICATION_EXPIRED',
      );
    });

    it('throws BadRequestException for already-used token', async () => {
      const record = {
        id: 'ver-1',
        userId: 'user-1',
        token: 'used-token',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: new Date(),
        user: { tenants: [{ tenantId: 'tenant-1' }] },
      };

      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.emailVerification.findFirst.mockResolvedValue(record);

      await expect(service.verify('used-token')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verify('used-token')).rejects.toThrow(
        'EMAIL_VERIFICATION_USED',
      );
    });

    it('throws BadRequestException for invalid token (not found)', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.emailVerification.findFirst.mockResolvedValue(null);

      await expect(service.verify('nonexistent')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verify('nonexistent')).rejects.toThrow(
        'EMAIL_VERIFICATION_INVALID_TOKEN',
      );
    });
  });
});
