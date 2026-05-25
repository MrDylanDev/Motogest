import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import {
  createSeedPrismaClient,
  createAppPrismaClient,
  seedTenant,
  seedAuditLog,
  truncateTenantTables,
} from './helpers/tenant-seed.helper';
import { signTestJwt, authHeader } from './helpers/jwt.helper';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

function tenantToken(tenantId: string, userId: string = TEST_USER_ID): string {
  return signTestJwt({ sub: userId, tenantId, role: 'admin_taller' });
}

describe('Multi-Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let seedPrisma: PrismaClient;
  let appPrisma: PrismaClient;

  beforeAll(async () => {
    // Override DATABASE_URL so Nest connects to the test DB via taller_app role
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    seedPrisma = createSeedPrismaClient();
    appPrisma = createAppPrismaClient();
  });

  beforeEach(async () => {
    await truncateTenantTables(seedPrisma);
  });

  afterAll(async () => {
    await truncateTenantTables(seedPrisma);
    await seedPrisma.$disconnect();
    await appPrisma.$disconnect();
    await app.close();
  });

  // Spec: "Request without Authorization header is rejected by JwtAuthGuard" → 401
  it('blocks request with no Authorization header → 401', async () => {
    await request(app.getHttpServer()).get('/audit-logs').expect(401);
  });

  // Spec: "Malformed tenantId (not UUID) inside a valid JWT is rejected by interceptor" → 401
  it('blocks request with invalid tenantId UUID inside JWT → 401', async () => {
    const badToken = signTestJwt({
      sub: TEST_USER_ID,
      tenantId: 'not-a-uuid',
      role: 'admin_taller',
    });

    await request(app.getHttpServer())
      .get('/audit-logs')
      .set(authHeader(badToken))
      .expect(401);
  });

  // Spec: "findMany filters by tenantId" — Tenant A only sees own audit logs
  it('Tenant A only sees Tenant A audit logs (scoped query)', async () => {
    const tenantA = await seedTenant(seedPrisma, {
      name: 'A',
      slug: 'a',
      subdomain: 'a',
    });
    const tenantB = await seedTenant(seedPrisma, {
      name: 'B',
      slug: 'b',
      subdomain: 'b',
    });

    await seedAuditLog(seedPrisma, {
      tenantId: tenantA.id,
      userId: TEST_USER_ID,
      action: 'a1',
    });
    await seedAuditLog(seedPrisma, {
      tenantId: tenantA.id,
      userId: TEST_USER_ID,
      action: 'a2',
    });
    await seedAuditLog(seedPrisma, {
      tenantId: tenantB.id,
      userId: TEST_USER_ID,
      action: 'b1',
    });
    await seedAuditLog(seedPrisma, {
      tenantId: tenantB.id,
      userId: TEST_USER_ID,
      action: 'b2',
    });
    await seedAuditLog(seedPrisma, {
      tenantId: tenantB.id,
      userId: TEST_USER_ID,
      action: 'b3',
    });

    // As Tenant A → 2 logs
    const resA = await request(app.getHttpServer())
      .get('/audit-logs')
      .set(authHeader(tenantToken(tenantA.id)))
      .expect(200);
    expect(resA.body).toHaveLength(2);

    // As Tenant B → 3 logs
    const resB = await request(app.getHttpServer())
      .get('/audit-logs')
      .set(authHeader(tenantToken(tenantB.id)))
      .expect(200);
    expect(resB.body).toHaveLength(3);
  });

  // Spec: "Tenant A cannot read Tenant B's resources" → 404 (NOT 403)
  it('Tenant A receives 404 on Tenant B audit log id (cross-tenant invisibility)', async () => {
    const tenantA = await seedTenant(seedPrisma, {
      name: 'A',
      slug: 'a',
      subdomain: 'a',
    });
    const tenantB = await seedTenant(seedPrisma, {
      name: 'B',
      slug: 'b',
      subdomain: 'b',
    });

    const logB = await seedAuditLog(seedPrisma, {
      tenantId: tenantB.id,
      userId: TEST_USER_ID,
      action: 'secret',
    });

    await request(app.getHttpServer())
      .get(`/audit-logs/${logB.id}`)
      .set(authHeader(tenantToken(tenantA.id)))
      .expect(404);
  });

  // Spec: "RLS blocks access without app.tenant_id set" → 0 rows
  it('RLS blocks raw query as taller_app without SET app.tenant_id → 0 rows', async () => {
    const tenantA = await seedTenant(seedPrisma, {
      name: 'A',
      slug: 'a',
      subdomain: 'a',
    });
    await seedAuditLog(seedPrisma, {
      tenantId: tenantA.id,
      userId: TEST_USER_ID,
      action: 'test',
    });

    // Raw query as taller_app (no SET LOCAL) → RLS blocks
    const rows = await appPrisma.$queryRaw<unknown[]>`SELECT * FROM audit_logs`;
    expect(rows).toHaveLength(0);
  });

  // Spec: "RLS allows raw query inside withRlsTransaction → only own tenant rows"
  it('RLS allows raw query as taller_app inside withRlsTransaction → only own tenant rows', async () => {
    const tenantA = await seedTenant(seedPrisma, {
      name: 'A',
      slug: 'a',
      subdomain: 'a',
    });
    const tenantB = await seedTenant(seedPrisma, {
      name: 'B',
      slug: 'b',
      subdomain: 'b',
    });

    await seedAuditLog(seedPrisma, {
      tenantId: tenantA.id,
      userId: TEST_USER_ID,
      action: 'a1',
    });
    await seedAuditLog(seedPrisma, {
      tenantId: tenantB.id,
      userId: TEST_USER_ID,
      action: 'b1',
    });
    await seedAuditLog(seedPrisma, {
      tenantId: tenantB.id,
      userId: TEST_USER_ID,
      action: 'b2',
    });

    const { PrismaService } =
      await import('../src/common/prisma/prisma.service');
    const { TenantContext } =
      await import('../src/common/tenant/tenant-context.service');
    const prismaService = app.get(PrismaService);
    const tenantContext = app.get(TenantContext);

    const rows = await tenantContext.run(
      { tenantId: tenantA.id, userId: TEST_USER_ID },
      () =>
        prismaService.withRlsTransaction(
          async (tx) =>
            tx.$queryRaw<{ id: string }[]>`SELECT id FROM audit_logs`,
        ),
    );

    expect(rows).toHaveLength(1);
  });
});
