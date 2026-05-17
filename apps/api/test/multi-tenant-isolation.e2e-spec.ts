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
  mockAuthenticatedUser,
  withMockUser,
} from './helpers/tenant-seed.helper';

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

  // Spec: "Request without req.user.tenantId is rejected" → 401
  it('blocks request with no req.user → 401', async () => {
    await request(app.getHttpServer()).get('/audit-logs').expect(401);
  });

  // Spec: "Malformed tenantId (not UUID) is rejected" → 401
  it('blocks request with invalid tenantId UUID → 401', async () => {
    // Create a separate app instance with bad user middleware
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const badApp = moduleFixture.createNestApplication();
    const badUser = {
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: 'not-a-uuid',
    };
    withMockUser(badUser)(badApp);
    await badApp.init();

    await request(badApp.getHttpServer()).get('/audit-logs').expect(401);

    await badApp.close();
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
    const userId = '00000000-0000-0000-0000-000000000001';

    await seedAuditLog(seedPrisma, {
      tenantId: tenantA.id,
      userId,
      action: 'a1',
    });
    await seedAuditLog(seedPrisma, {
      tenantId: tenantA.id,
      userId,
      action: 'a2',
    });
    await seedAuditLog(seedPrisma, {
      tenantId: tenantB.id,
      userId,
      action: 'b1',
    });
    await seedAuditLog(seedPrisma, {
      tenantId: tenantB.id,
      userId,
      action: 'b2',
    });
    await seedAuditLog(seedPrisma, {
      tenantId: tenantB.id,
      userId,
      action: 'b3',
    });

    // As Tenant A → 2 logs
    const moduleA = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const appA = moduleA.createNestApplication();
    withMockUser(mockAuthenticatedUser(tenantA.id, userId))(appA);
    await appA.init();

    const resA = await request(appA.getHttpServer())
      .get('/audit-logs')
      .expect(200);
    expect(resA.body).toHaveLength(2);

    // As Tenant B → 3 logs
    const moduleB = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const appB = moduleB.createNestApplication();
    withMockUser(mockAuthenticatedUser(tenantB.id, userId))(appB);
    await appB.init();

    const resB = await request(appB.getHttpServer())
      .get('/audit-logs')
      .expect(200);
    expect(resB.body).toHaveLength(3);

    await appA.close();
    await appB.close();
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
    const userId = '00000000-0000-0000-0000-000000000001';

    const logB = await seedAuditLog(seedPrisma, {
      tenantId: tenantB.id,
      userId,
      action: 'secret',
    });

    const moduleA = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const appA = moduleA.createNestApplication();
    withMockUser(mockAuthenticatedUser(tenantA.id, userId))(appA);
    await appA.init();

    await request(appA.getHttpServer())
      .get(`/audit-logs/${logB.id}`)
      .expect(404);

    await appA.close();
  });

  // Spec: "RLS blocks access without app.tenant_id set" → 0 rows
  it('RLS blocks raw query as taller_app without SET app.tenant_id → 0 rows', async () => {
    const tenantA = await seedTenant(seedPrisma, {
      name: 'A',
      slug: 'a',
      subdomain: 'a',
    });
    const userId = '00000000-0000-0000-0000-000000000001';
    await seedAuditLog(seedPrisma, {
      tenantId: tenantA.id,
      userId,
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
    const userId = '00000000-0000-0000-0000-000000000001';

    await seedAuditLog(seedPrisma, {
      tenantId: tenantA.id,
      userId,
      action: 'a1',
    });
    await seedAuditLog(seedPrisma, {
      tenantId: tenantB.id,
      userId,
      action: 'b1',
    });
    await seedAuditLog(seedPrisma, {
      tenantId: tenantB.id,
      userId,
      action: 'b2',
    });

    // Use the Nest app's PrismaService with TenantContext set to Tenant A
    const moduleA = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const appInstance = moduleA.createNestApplication();
    await appInstance.init();

    const { PrismaService } =
      await import('../src/common/prisma/prisma.service');
    const { TenantContext } =
      await import('../src/common/tenant/tenant-context.service');
    const prismaService = moduleA.get(PrismaService);
    const tenantContext = moduleA.get(TenantContext);

    const rows = await tenantContext.run({ tenantId: tenantA.id, userId }, () =>
      prismaService.withRlsTransaction(
        async (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM audit_logs`,
      ),
    );

    expect(rows).toHaveLength(1);

    await appInstance.close();
  });
});
