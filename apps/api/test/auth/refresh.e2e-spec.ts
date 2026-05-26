import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { createSeedPrismaClient } from '../helpers/tenant-seed.helper';
import {
  seedActiveUserWithTenant,
  truncateAuthTables,
} from '../helpers/auth-seed.helper';

describe('Refresh Token Rotation (e2e)', () => {
  let app: INestApplication;
  let seedPrisma: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    seedPrisma = createSeedPrismaClient();
  });

  beforeEach(async () => {
    await truncateAuthTables(seedPrisma);
  });

  afterAll(async () => {
    await truncateAuthTables(seedPrisma);
    await seedPrisma.$disconnect();
    await app.close();
  });

  function extractRefreshCookie(res: request.Response): string | undefined {
    const cookies = res.headers['set-cookie'];
    if (!cookies) return undefined;
    const arr = Array.isArray(cookies) ? cookies : [cookies];
    const match = arr.find((c: string) => c.startsWith('refreshToken='));
    if (!match) return undefined;
    return match.split(';')[0].split('=').slice(1).join('=');
  }

  it('valid refresh token → new access + new refresh cookie, old refresh invalid', async () => {
    const { email, password } = await seedActiveUserWithTenant(seedPrisma);

    // Login — refresh token in cookie, NOT in body
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    expect(loginRes.body.accessToken).toBeDefined();
    expect(loginRes.body.refreshToken).toBeUndefined();

    const refreshCookie = extractRefreshCookie(loginRes);
    expect(refreshCookie).toBeDefined();

    // Rotate: send refresh token via cookie
    const rotateRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshCookie}`])
      .expect(200);

    expect(rotateRes.body.accessToken).toBeDefined();
    expect(rotateRes.body.refreshToken).toBeUndefined();

    const newRefreshCookie = extractRefreshCookie(rotateRes);
    expect(newRefreshCookie).toBeDefined();
    expect(newRefreshCookie).not.toBe(refreshCookie);

    // Old refresh token cookie is now invalid
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshCookie}`])
      .expect(401);
  });

  it('missing refresh token cookie → 401 MissingRefreshToken', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').expect(401);
  });

  it('reuse of revoked refresh → entire family revoked, all attempts fail', async () => {
    const { email, password } = await seedActiveUserWithTenant(seedPrisma);

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    const token1 = extractRefreshCookie(loginRes)!;

    // Rotate once: token1 → token2
    const rotate1 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [`refreshToken=${token1}`])
      .expect(200);

    const token2 = extractRefreshCookie(rotate1)!;

    // Reuse token1 (already revoked) → triggers theft detection
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [`refreshToken=${token1}`])
      .expect(401);

    // token2 should also be revoked (entire family)
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [`refreshToken=${token2}`])
      .expect(401);
  });
});
