import { Injectable, Logger } from '@nestjs/common';
import type { EmailService } from './email.interface';

@Injectable()
export class ConsoleEmailService implements EmailService {
  private readonly logger = new Logger(ConsoleEmailService.name);

  async sendVerificationEmail(
    to: string,
    token: string,
    tenantName: string,
  ): Promise<void> {
    this.logger.log(
      `[${tenantName}] Verification email for ${to}: /auth/verify-email?token=${token}`,
    );
  }
}
