import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    tenant: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockJwt = { signAsync: jest.fn().mockResolvedValue('access-token') };
  const mockEmail = { sendVerificationEmail: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: 'EMAIL_SERVICE', useValue: mockEmail },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  describe('signup', () => {
    const dto = {
      email: 'test@example.com',
      password: 'Str0ng!Pass',
      fullName: 'Test User',
      tenantName: 'Test Tenant',
      tenantSlug: 'test-tenant',
    };

    it('creates Tenant+User+UserTenant+Subscription atomically', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
          user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
          emailVerification: {
            create: jest.fn().mockResolvedValue({ token: 'tok' }),
          },
          $executeRawUnsafe: jest.fn(),
          userTenant: { create: jest.fn().mockResolvedValue({}) },
          subscription: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.signup(dto);

      expect(result).toEqual({ message: 'verify_email_sent' });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('calls EmailService.sendVerificationEmail with user email and token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
          user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
          emailVerification: {
            create: jest.fn().mockResolvedValue({ token: 'tok' }),
          },
          $executeRawUnsafe: jest.fn(),
          userTenant: { create: jest.fn().mockResolvedValue({}) },
          subscription: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      await service.signup(dto);

      expect(mockEmail.sendVerificationEmail).toHaveBeenCalledWith(
        dto.email,
        expect.any(String),
        dto.tenantName,
      );
    });

    it('throws ConflictException on duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.signup(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const dto = { email: 'test@example.com', password: 'Str0ng!Pass' };

    it('emits JWT with sub, tenantId, role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        passwordHash: '$2b$10$validhash',
        emailVerified: true,
        tenants: [
          {
            tenantId: 'tenant-1',
            role: 'admin_taller',
            tenant: { status: 'active' },
          },
        ],
      });
      // Mock bcrypt compare
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await service.login(dto);

      expect(result.accessToken).toBe('access-token');
      expect(mockJwt.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        tenantId: 'tenant-1',
        role: 'admin_taller',
      });
    });

    it('throws ForbiddenException when email not verified', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        passwordHash: '$2b$10$validhash',
        emailVerified: false,
        tenants: [
          {
            tenantId: 'tenant-1',
            role: 'admin_taller',
            tenant: { status: 'pending_verification' },
          },
        ],
      });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    });

    it('throws UnauthorizedException on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        passwordHash: '$2b$10$validhash',
        emailVerified: true,
        tenants: [
          {
            tenantId: 'tenant-1',
            role: 'admin_taller',
            tenant: { status: 'active' },
          },
        ],
      });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });
});
