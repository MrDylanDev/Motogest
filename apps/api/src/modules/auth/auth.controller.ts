import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { RefreshTokenService } from './refresh-token.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { UnauthorizedException } from '@nestjs/common';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/auth/refresh',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly emailVerification: EmailVerificationService,
    private readonly refreshToken: RefreshTokenService,
  ) {}

  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto): Promise<{ message: string }> {
    return this.auth.signup(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const { accessToken, refreshToken } = await this.auth.login(dto);
    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken };
  }

  @Public()
  @SkipThrottle()
  @Get('verify-email')
  verifyEmail(@Query('token') token: string): Promise<void> {
    return this.emailVerification.verify(token);
  }

  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const rawToken = req.cookies?.refreshToken;
    if (!rawToken) {
      throw new UnauthorizedException('MissingRefreshToken');
    }
    const { accessToken, refreshToken } =
      await this.refreshToken.rotate(rawToken);
    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken };
  }
}
