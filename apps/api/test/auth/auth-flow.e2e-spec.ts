import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { createSeedPrismaClient } from '../helpers/tenant-seed.helper';
import { truncateAuthTables } from '../helpers/auth-seed.helper';

describe('Auth Flow (e2e)', () => {
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

  it('full signup → verify-email → login → protected route', async () => {
    // 1. Signup
    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'flow@test.local',
        password: 'Test1234!',
        fullName: 'Flow User',
        tenantName: 'Flow Tenant',
        tenantSlug: 'flow-tenant',
      })
      .expect(201);

    expect(signupRes.body.message).toBe('verify_email_sent');

    // 2. Retrieve verification token from DB
    const verification = await seedPrisma.emailVerification.findFirst({
      where: { user: { email: 'flow@test.local' } },
    });
    expect(verification).not.toBeNull();

    // 3. Verify email (GET — email link convention)
    await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: verification!.token })
      .expect(200);

    // 4. Confirm tenant is now active
    const tenant = await seedPrisma.tenant.findFirst({
      where: { slug: 'flow-tenant' },
    });
    expect(tenant!.status).toBe('active');

    // 5. Login — refresh token in cookie, not body
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'flow@test.local', password: 'Test1234!' })
      .expect(200);

    expect(loginRes.body.accessToken).toBeDefined();
    expect(typeof loginRes.body.accessToken).toBe('string');
    expect(loginRes.body.refreshToken).toBeUndefined();

    // Verify refresh token is in Set-Cookie header
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const hasRefreshCookie = (
      Array.isArray(cookies) ? cookies : [cookies]
    ).some((c: string) => c.startsWith('refreshToken='));
    expect(hasRefreshCookie).toBe(true);

    // 6. Access protected route with token
    const protectedRes = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    expect(Array.isArray(protectedRes.body)).toBe(true);
  });
});
