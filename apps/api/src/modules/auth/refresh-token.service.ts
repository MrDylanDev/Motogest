import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async create(userId: string): Promise<{ refreshToken: string; familyId: string }> {
    const raw = randomUUID();
    const familyId = randomUUID();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(raw),
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
      },
    });
    return { refreshToken: raw, familyId };
  }

  async rotate(rawToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.hash(rawToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('REFRESH_EXPIRED');
    }

    // Theft detection: token already revoked means reuse
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('REFRESH_REVOKED');
    }

    // Revoke current token
    await this.prisma.refreshToken.updateMany({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    // Issue new token in same family
    const newRaw = randomUUID();
    await this.prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: this.hash(newRaw),
        familyId: stored.familyId,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      include: { tenants: true },
    });
    const membership = user!.tenants[0];

    const accessToken = await this.jwt.signAsync({
      sub: user!.id,
      tenantId: membership.tenantId,
      role: membership.role,
    });

    return { accessToken, refreshToken: newRaw };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
