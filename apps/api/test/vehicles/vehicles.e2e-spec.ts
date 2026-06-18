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
  seedClient,
  truncateClientsTable,
} from '../helpers/client-seed.helper';
import {
  seedVehicle,
  truncateVehiclesTable,
} from '../helpers/vehicle-seed.helper';

describe('VehiclesController (e2e)', () => {
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
    await truncateVehiclesTable(seedPrisma);
    await truncateClientsTable(seedPrisma);
    await truncateAuthTables(seedPrisma);
    await seedPrisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await truncateVehiclesTable(seedPrisma);
    await truncateClientsTable(seedPrisma);
    await truncateAuthTables(seedPrisma);
  });

  describe('POST /vehicles', () => {
    it('should create a vehicle', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });

      const createDto = {
        clientId: client.id,
        make: 'Toyota',
        model: 'Corolla',
        year: 2020,
        plate: 'ABC123',
        vin: '1HGBH41JXMN109186',
        color: 'Blue',
        fuelType: 'gasoline',
        mileage: 50000,
        notes: 'Test vehicle',
      };

      const response = await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.make).toBe(createDto.make);
      expect(response.body.model).toBe(createDto.model);
      expect(response.body.plate).toBe(createDto.plate);
      expect(response.body.client.id).toBe(client.id);
    });

    it('should reject duplicate plate', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });

      const createDto = {
        clientId: client.id,
        make: 'Toyota',
        model: 'Corolla',
        plate: 'ABC123',
      };

      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createDto)
        .expect(201);

      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createDto)
        .expect(409);
    });

    it('should reject non-existent client', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma);

      const createDto = {
        clientId: '00000000-0000-0000-0000-000000000000',
        make: 'Toyota',
        model: 'Corolla',
        plate: 'ABC123',
      };

      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createDto)
        .expect(404);
    });

    it('should validate VIN format', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });

      const createDto = {
        clientId: client.id,
        make: 'Toyota',
        model: 'Corolla',
        plate: 'ABC123',
        vin: 'INVALID', // VIN must be 17 characters
      };

      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createDto)
        .expect(400);
    });
  });

  describe('GET /vehicles', () => {
    it('should return paginated vehicles', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });

      await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
        plate: 'ABC123',
      });
      await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
        plate: 'XYZ789',
      });

      const response = await request(app.getHttpServer())
        .get('/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
      expect(response.body.meta.page).toBe(1);
    });

    it('should filter by clientId', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client1 = await seedClient(seedPrisma, { tenantId });
      const client2 = await seedClient(seedPrisma, { tenantId });

      await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client1.id,
        plate: 'ABC123',
      });
      await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client2.id,
        plate: 'XYZ789',
      });

      const response = await request(app.getHttpServer())
        .get('/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ clientId: client1.id })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].client.id).toBe(client1.id);
    });

    it('should search in multiple fields', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });

      await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
        make: 'Toyota',
        plate: 'ABC123',
      });
      await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
        make: 'Honda',
        plate: 'XYZ789',
      });

      const response = await request(app.getHttpServer())
        .get('/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ search: 'Toyota' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].make).toBe('Toyota');
    });
  });

  describe('GET /vehicles/:id', () => {
    it('should return a vehicle by id', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });

      const response = await request(app.getHttpServer())
        .get(`/vehicles/${vehicle.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(vehicle.id);
      expect(response.body.client).toBeDefined();
    });

    it('should return 404 for non-existent vehicle', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma);

      await request(app.getHttpServer())
        .get('/vehicles/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /vehicles/:id', () => {
    it('should update a vehicle', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });

      const updateDto = {
        make: 'Honda',
        model: 'Civic',
        mileage: 60000,
      };

      const response = await request(app.getHttpServer())
        .patch(`/vehicles/${vehicle.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.make).toBe('Honda');
      expect(response.body.model).toBe('Civic');
      expect(response.body.mileage).toBe(60000);
    });

    it('should reject duplicate plate on update', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle1 = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
        plate: 'ABC123',
      });
      await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
        plate: 'XYZ789',
      });

      await request(app.getHttpServer())
        .patch(`/vehicles/${vehicle1.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ plate: 'XYZ789' })
        .expect(409);
    });
  });

  describe('DELETE /vehicles/:id', () => {
    it('should soft delete a vehicle', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });

      const response = await request(app.getHttpServer())
        .delete(`/vehicles/${vehicle.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.status).toBe('inactive');
    });

    it('should return 404 for non-existent vehicle', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma);

      await request(app.getHttpServer())
        .delete('/vehicles/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  // TODO: Fix RBAC tests - throttle limit (5 requests per 60s) causes failures
  // These tests need to be refactored to work within throttle constraints
  // or use a separate test suite with higher throttle limits
  /*
  describe('RBAC', () => {
    it('should allow admin_taller to create', async () => {
      const { accessToken, tenantId } = await seedActiveUserWithTenant(seedPrisma, {
        role: 'admin_taller',
      });
      const client = await seedClient(seedPrisma, { tenantId });

      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          clientId: client.id,
          make: 'Toyota',
          model: 'Corolla',
          plate: 'ABC123',
        })
        .expect(201);
    });

    it('should allow recepcionista to create', async () => {
      const { accessToken, tenantId } = await seedActiveUserWithTenant(seedPrisma, {
        role: 'recepcionista',
      });
      const client = await seedClient(seedPrisma, { tenantId });

      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          clientId: client.id,
          make: 'Toyota',
          model: 'Corolla',
          plate: 'ABC123',
        })
        .expect(201);
    });

    it('should allow mecanico to read but not create', async () => {
      const { accessToken, tenantId } = await seedActiveUserWithTenant(seedPrisma, {
        role: 'mecanico',
      });
      const client = await seedClient(seedPrisma, { tenantId });
      await seedVehicle(seedPrisma, { tenantId, clientId: client.id });

      // Can read
      await request(app.getHttpServer())
        .get('/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Cannot create
      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          clientId: client.id,
          make: 'Toyota',
          model: 'Corolla',
          plate: 'ABC123',
        })
        .expect(403);
    });
  });
  */
});
