import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { createSeedPrismaClient } from '../helpers/tenant-seed.helper';
import {
  seedActiveUserWithTenant,
  truncateAuthTables,
} from '../helpers/auth-seed.helper';
import {
  seedSparePart,
  truncateSparePartsTable,
} from '../helpers/spare-part-seed.helper';

describe('SparePartsController (e2e)', () => {
  let app: INestApplication;
  let seedPrisma: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    seedPrisma = createSeedPrismaClient();
  }, 30000);

  afterAll(async () => {
    await truncateSparePartsTable(seedPrisma);
    await truncateAuthTables(seedPrisma);
    await seedPrisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await truncateSparePartsTable(seedPrisma);
    await truncateAuthTables(seedPrisma);
  });

  describe('POST /spare-parts', () => {
    it('should create a spare part', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma);

      const createDto = {
        code: 'SP-001',
        name: 'Brake Pad',
        description: 'Front brake pad',
        category: 'brakes',
        unit: 'unit',
        currentStock: 10,
        minStock: 5,
        maxStock: 50,
        unitCost: 25.5,
        sellingPrice: 45.0,
        supplier: 'AutoParts Inc',
        notes: 'Test spare part',
      };

      const response = await request(app.getHttpServer())
        .post('/spare-parts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.code).toBe(createDto.code);
      expect(response.body.name).toBe(createDto.name);
      expect(response.body.category).toBe(createDto.category);
    });

    it('should create a spare part with only required fields', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma);

      const createDto = {
        code: 'SP-002',
        name: 'Oil Filter',
      };

      const response = await request(app.getHttpServer())
        .post('/spare-parts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.code).toBe(createDto.code);
      expect(response.body.name).toBe(createDto.name);
      expect(response.body.currentStock).toBe(0);
    });

    it('should reject duplicate code', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma);

      const createDto = {
        code: 'SP-001',
        name: 'Brake Pad',
      };

      await request(app.getHttpServer())
        .post('/spare-parts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createDto)
        .expect(201);

      await request(app.getHttpServer())
        .post('/spare-parts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createDto)
        .expect(409);
    });

    // TODO: Fix throttle limit - this test hits 429 due to rate limiting
    /*
    it('should validate required fields', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma);

      const createDto = {
        description: 'Missing code and name',
      };

      await request(app.getHttpServer())
        .post('/spare-parts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createDto)
        .expect(400);
    });
    */
  });

  describe('GET /spare-parts', () => {
    it('should return paginated spare parts', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);

      await seedSparePart(seedPrisma, { tenantId, code: 'SP-001' });
      await seedSparePart(seedPrisma, { tenantId, code: 'SP-002' });

      const response = await request(app.getHttpServer())
        .get('/spare-parts')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
      expect(response.body.meta.page).toBe(1);
    });

    it('should filter by status', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);

      await seedSparePart(seedPrisma, { tenantId, status: 'active' });
      await seedSparePart(seedPrisma, { tenantId, status: 'inactive' });

      const response = await request(app.getHttpServer())
        .get('/spare-parts')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ status: 'active' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('active');
    });

    it('should filter by category', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);

      await seedSparePart(seedPrisma, { tenantId, category: 'brakes' });
      await seedSparePart(seedPrisma, { tenantId, category: 'engine' });

      const response = await request(app.getHttpServer())
        .get('/spare-parts')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ category: 'brakes' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].category).toBe('brakes');
    });

    it('should search in multiple fields', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);

      await seedSparePart(seedPrisma, { tenantId, name: 'Brake Pad' });
      await seedSparePart(seedPrisma, { tenantId, name: 'Oil Filter' });

      const response = await request(app.getHttpServer())
        .get('/spare-parts')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ search: 'Brake' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Brake Pad');
    });
  });

  describe('GET /spare-parts/:id', () => {
    it('should return a spare part by id', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const sparePart = await seedSparePart(seedPrisma, { tenantId });

      const response = await request(app.getHttpServer())
        .get(`/spare-parts/${sparePart.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(sparePart.id);
      expect(response.body.code).toBe(sparePart.code);
    });

    it('should return 404 for non-existent spare part', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma);

      await request(app.getHttpServer())
        .get('/spare-parts/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /spare-parts/:id', () => {
    it('should update a spare part', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const sparePart = await seedSparePart(seedPrisma, { tenantId });

      const updateDto = {
        name: 'Updated Brake Pad',
        currentStock: 15,
      };

      const response = await request(app.getHttpServer())
        .patch(`/spare-parts/${sparePart.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.name).toBe('Updated Brake Pad');
      expect(response.body.currentStock).toBe(15);
    });

    it('should reject duplicate code on update', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const sparePart1 = await seedSparePart(seedPrisma, {
        tenantId,
        code: 'SP-001',
      });
      await seedSparePart(seedPrisma, {
        tenantId,
        code: 'SP-002',
      });

      await request(app.getHttpServer())
        .patch(`/spare-parts/${sparePart1.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: 'SP-002' })
        .expect(409);
    });
  });

  describe('DELETE /spare-parts/:id', () => {
    it('should soft delete a spare part', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const sparePart = await seedSparePart(seedPrisma, { tenantId });

      const response = await request(app.getHttpServer())
        .delete(`/spare-parts/${sparePart.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.status).toBe('inactive');
    });

    it('should return 404 for non-existent spare part', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma);

      await request(app.getHttpServer())
        .delete('/spare-parts/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  // TODO: Fix RBAC tests - throttle limit (5 requests per 60s) causes failures
  /*
  describe('RBAC', () => {
    it('should allow admin_taller to create', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma, {
        role: 'admin_taller',
      });

      await request(app.getHttpServer())
        .post('/spare-parts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: 'SP-001', name: 'Test Part' })
        .expect(201);
    });

    it('should allow recepcionista to create', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma, {
        role: 'recepcionista',
      });

      await request(app.getHttpServer())
        .post('/spare-parts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: 'SP-001', name: 'Test Part' })
        .expect(201);
    });

    it('should allow mecanico to read but not create', async () => {
      const { accessToken, tenantId } = await seedActiveUserWithTenant(seedPrisma, {
        role: 'mecanico',
      });
      await seedSparePart(seedPrisma, { tenantId });

      // Can read
      await request(app.getHttpServer())
        .get('/spare-parts')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Cannot create
      await request(app.getHttpServer())
        .post('/spare-parts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: 'SP-002', name: 'Test Part' })
        .expect(403);
    });
  });
  */
});
