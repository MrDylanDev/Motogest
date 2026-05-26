import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RefreshTokenService } from './refresh-token.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import type { EmailService } from '../../common/email/email.interface';
import { EMAIL_VERIFICATION_EXPIRES_HOURS } from './auth.constants';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly refreshToken: RefreshTokenService,
    @Inject('EMAIL_SERVICE') private readonly email: EmailService,
  ) {}

  async signup(dto: SignupDto): Promise<{ message: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('EMAIL_ALREADY_EXISTS');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const verificationToken = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      // Phase 1: global tables (no RLS needed)
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug: dto.tenantSlug,
          subdomain: dto.tenantSlug,
          status: 'pending_verification',
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          status: 'pending_verification',
        },
      });

      await tx.emailVerification.create({
        data: {
          userId: user.id,
          token: verificationToken,
          expiresAt: new Date(
            Date.now() + EMAIL_VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000,
          ),
        },
      });

      // Phase 2: tenant-scoped tables — SET LOCAL for RLS
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);

      await tx.userTenant.create({
        data: { userId: user.id, tenantId: tenant.id, role: 'admin_taller' },
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: 'free',
          status: 'trialing',
        },
      });
    });

    await this.email.sendVerificationEmail(
      dto.email,
      verificationToken,
      dto.tenantName,
    );

    return { message: 'verify_email_sent' };
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { tenants: { include: { tenant: true } } },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const membership = user.tenants[0];
    if (
      !user.emailVerified ||
      membership?.tenant.status === 'pending_verification'
    ) {
      throw new ForbiddenException('EMAIL_NOT_VERIFIED');
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      tenantId: membership.tenantId,
      role: membership.role,
    });

    const { refreshToken } = await this.refreshToken.create(user.id);

    return { accessToken, refreshToken };
  }
}
