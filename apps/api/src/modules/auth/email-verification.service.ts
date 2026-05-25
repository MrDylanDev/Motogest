import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class EmailVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(token: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const record = await tx.emailVerification.findFirst({
        where: { token },
        include: { user: { include: { tenants: true } } },
      });

      if (!record) {
        throw new BadRequestException('EMAIL_VERIFICATION_INVALID_TOKEN');
      }

      if (record.usedAt) {
        throw new BadRequestException('EMAIL_VERIFICATION_USED');
      }

      if (record.expiresAt < new Date()) {
        throw new BadRequestException('EMAIL_VERIFICATION_EXPIRED');
      }

      const tenantId = record.user.tenants[0]?.tenantId;
      if (!tenantId) {
        throw new BadRequestException('EMAIL_VERIFICATION_INVALID_TOKEN');
      }

      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerified: true, status: 'active' },
      });

      // tenants table is global (no RLS, no tenantId column) — direct access is correct
      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: 'active' },
      });

      await tx.emailVerification.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
    });
  }
}
