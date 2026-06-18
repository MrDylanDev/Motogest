import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { createSeedPrismaClient } from '../helpers/tenant-seed.helper';
import {
  truncateAuthTables,
  seedActiveUserWithTenant,
} from '../helpers/auth-seed.helper';
import { truncateClientsTable } from '../helpers/client-seed.helper';

describe('Clients API (e2e)', () => {
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
    await truncateClientsTable(seedPrisma);
  });

  afterAll(async () => {
    await truncateAuthTables(seedPrisma);
    await truncateClientsTable(seedPrisma);
    await seedPrisma.$disconnect();
    await app.close();
  });

  describe('POST /clients', () => {
    it('creates a client and returns 201', async () => {
      const seeded = await seedActiveUserWithTenant(seedPrisma);

      const res = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${seeded.accessToken}`)
        .send({
          name: 'Juan Pérez',
          email: 'juan@test.com',
          phone: '1145678901',
        })
        .expect(201);

      expect(res.body.name).toBe('Juan Pérez');
      expect(res.body.email).toBe('juan@test.com');
      expect(res.body.status).toBe('active');
    });

    it('rejects duplicate email within tenant with 409', async () => {
      const seeded = await seedActiveUserWithTenant(seedPrisma);

      await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${seeded.accessToken}`)
        .send({ name: 'A', email: 'dup@test.com' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${seeded.accessToken}`)
        .send({ name: 'B', email: 'dup@test.com' })
        .expect(409);
    });

    it('rejects missing required fields with 400', async () => {
      const seeded = await seedActiveUserWithTenant(seedPrisma);

      await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${seeded.accessToken}`)
        .send({ email: 'juan@test.com' })
        .expect(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .post('/clients')
        .send({ name: 'Juan Pérez' })
        .expect(401);
    });
  });

  describe('GET /clients', () => {
    it('returns paginated clients list', async () => {
      const seeded = await seedActiveUserWithTenant(seedPrisma);

      await seedPrisma.client.create({
        data: {
          tenantId: seeded.tenantId,
          name: 'Juan Pérez',
          email: 'juan@test.com',
        },
      });

      const res = await request(app.getHttpServer())
        .get('/clients')
        .set('Authorization', `Bearer ${seeded.accessToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.meta.page).toBe(1);
    });

    it('filters by search term', async () => {
      const seeded = await seedActiveUserWithTenant(seedPrisma);

      await seedPrisma.client.createMany({
        data: [
          { tenantId: seeded.tenantId, name: 'Juan Pérez' },
          { tenantId: seeded.tenantId, name: 'María García' },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/clients?search=juan')
        .set('Authorization', `Bearer ${seeded.accessToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Juan Pérez');
    });
  });

  describe('GET /clients/:id', () => {
    it('returns a single client', async () => {
      const seeded = await seedActiveUserWithTenant(seedPrisma);

      const client = await seedPrisma.client.create({
        data: {
          tenantId: seeded.tenantId,
          name: 'Juan Pérez',
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/clients/${client.id}`)
        .set('Authorization', `Bearer ${seeded.accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(client.id);
    });

    it('returns 404 for non-existent client', async () => {
      const seeded = await seedActiveUserWithTenant(seedPrisma);

      await request(app.getHttpServer())
        .get('/clients/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${seeded.accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /clients/:id', () => {
    it('updates client fields', async () => {
      const seeded = await seedActiveUserWithTenant(seedPrisma);

      const client = await seedPrisma.client.create({
        data: {
          tenantId: seeded.tenantId,
          name: 'Juan Pérez',
          phone: '1111111111',
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/clients/${client.id}`)
        .set('Authorization', `Bearer ${seeded.accessToken}`)
        .send({ phone: '2222222222' })
        .expect(200);

      expect(res.body.phone).toBe('2222222222');
    });
  });

  describe('DELETE /clients/:id', () => {
    it('soft-deletes a client (status → inactive)', async () => {
      const seeded = await seedActiveUserWithTenant(seedPrisma);

      const client = await seedPrisma.client.create({
        data: {
          tenantId: seeded.tenantId,
          name: 'Juan Pérez',
        },
      });

      const res = await request(app.getHttpServer())
        .delete(`/clients/${client.id}`)
        .set('Authorization', `Bearer ${seeded.accessToken}`)
        .expect(200);

      expect(res.body.status).toBe('inactive');
    });

    it('rejects deletion when client has vehicles', async () => {
      const seeded = await seedActiveUserWithTenant(seedPrisma);

      const client = await seedPrisma.client.create({
        data: {
          tenantId: seeded.tenantId,
          name: 'Juan Pérez',
        },
      });

      await seedPrisma.vehicle.create({
        data: {
          tenantId: seeded.tenantId,
          clientId: client.id,
          make: 'Toyota',
          model: 'Corolla',
          plate: 'ABC123',
        },
      });

      await request(app.getHttpServer())
        .delete(`/clients/${client.id}`)
        .set('Authorization', `Bearer ${seeded.accessToken}`)
        .expect(409);
    });

    it('rejects recepcionista role with 403', async () => {
      const seeded = await seedActiveUserWithTenant(seedPrisma, {
        role: 'recepcionista',
      });

      const client = await seedPrisma.client.create({
        data: {
          tenantId: seeded.tenantId,
          name: 'Juan Pérez',
        },
      });

      await request(app.getHttpServer())
        .delete(`/clients/${client.id}`)
        .set('Authorization', `Bearer ${seeded.accessToken}`)
        .expect(403);
    });
  });

  describe('Tenant isolation', () => {
    it('tenant A cannot see tenant B clients', async () => {
      const tenantA = await seedActiveUserWithTenant(seedPrisma, {
        email: 'a@test.com',
        tenantSlug: 'tenant-a',
      });
      const tenantB = await seedActiveUserWithTenant(seedPrisma, {
        email: 'b@test.com',
        tenantSlug: 'tenant-b',
      });

      await seedPrisma.client.create({
        data: {
          tenantId: tenantB.tenantId,
          name: 'Secret Client',
        },
      });

      const res = await request(app.getHttpServer())
        .get('/clients')
        .set('Authorization', `Bearer ${tenantA.accessToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it('tenant A cannot update tenant B client', async () => {
      const tenantA = await seedActiveUserWithTenant(seedPrisma, {
        email: 'a2@test.com',
        tenantSlug: 'tenant-a2',
      });
      const tenantB = await seedActiveUserWithTenant(seedPrisma, {
        email: 'b2@test.com',
        tenantSlug: 'tenant-b2',
      });

      const clientB = await seedPrisma.client.create({
        data: {
          tenantId: tenantB.tenantId,
          name: 'Secret Client',
        },
      });

      await request(app.getHttpServer())
        .patch(`/clients/${clientB.id}`)
        .set('Authorization', `Bearer ${tenantA.accessToken}`)
        .send({ name: 'Hacked' })
        .expect(404);
    });
  });
});
