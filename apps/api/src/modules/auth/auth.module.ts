import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { RefreshTokenService } from './refresh-token.service';
import { EmailVerificationService } from './email-verification.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConsoleEmailService } from '../../common/email/console-email.service';
import { JWT_EXPIRES_IN } from './auth.constants';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: JWT_EXPIRES_IN },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenService,
    EmailVerificationService,
    JwtStrategy,
    { provide: 'EMAIL_SERVICE', useClass: ConsoleEmailService },
  ],
})
export class AuthModule {}
