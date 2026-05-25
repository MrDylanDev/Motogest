import { JwtService } from '@nestjs/jwt';

/**
 * Signs JWTs for E2E tests using the same secret the app validates against.
 *
 * The app boots with JWT_SECRET from the environment; in test runs the
 * orchestrator (CI or scripts/ci-local.sh) sets JWT_SECRET=test-secret.
 *
 * Use this helper instead of injecting req.user via middleware — once the
 * global JwtAuthGuard is in place, only valid signed tokens populate
 * req.user via JwtStrategy.validate().
 */
export interface TestJwtPayload {
  sub: string;
  tenantId: string;
  role: string;
}

const FIFTEEN_MINUTES_IN_SECONDS = 15 * 60;

const testJwtService = new JwtService({
  secret: process.env.JWT_SECRET ?? 'test-secret',
});

export function signTestJwt(
  payload: TestJwtPayload,
  options: { expiresInSeconds?: number } = {},
): string {
  return testJwtService.sign(payload, {
    expiresIn: options.expiresInSeconds ?? FIFTEEN_MINUTES_IN_SECONDS,
  });
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
