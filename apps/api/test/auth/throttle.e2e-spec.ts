import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { createSeedPrismaClient } from '../helpers/tenant-seed.helper';
import { truncateAuthTables } from '../helpers/auth-seed.helper';
import { PrismaClient } from '@prisma/client';

describe('Throttler (integration)', () => {
  let app: INestApplication;
  let seedPrisma: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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

  it('6th signup from same IP within 60s → 429', async () => {
    const server = app.getHttpServer();

    // First 5 requests should succeed (201 or 409 for duplicate)
    for (let i = 0; i < 5; i++) {
      await request(server)
        .post('/auth/signup')
        .send({
          email: `throttle${i}@test.local`,
          password: 'Test1234!',
          fullName: 'Throttle User',
          tenantName: `Throttle Tenant ${i}`,
          tenantSlug: `throttle-${i}`,
        })
        .expect(201);
    }

    // 6th request should be throttled
    const res = await request(server).post('/auth/signup').send({
      email: 'throttle5@test.local',
      password: 'Test1234!',
      fullName: 'Throttle User',
      tenantName: 'Throttle Tenant 5',
      tenantSlug: 'throttle-5',
    });

    expect(res.status).toBe(429);
  });
});
