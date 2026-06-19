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
import {
  seedWorkOrder,
  truncateWorkOrdersTable,
} from '../helpers/work-order-seed.helper';
import {
  seedInvoice,
  truncateInvoicesTable,
} from '../helpers/invoice-seed.helper';

describe('InvoicesController (e2e)', () => {
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
    await truncateInvoicesTable(seedPrisma);
    await truncateWorkOrdersTable(seedPrisma);
    await truncateVehiclesTable(seedPrisma);
    await truncateClientsTable(seedPrisma);
    await truncateAuthTables(seedPrisma);
    await seedPrisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await truncateInvoicesTable(seedPrisma);
    await truncateWorkOrdersTable(seedPrisma);
    await truncateVehiclesTable(seedPrisma);
    await truncateClientsTable(seedPrisma);
    await truncateAuthTables(seedPrisma);
  });

  describe('POST /work-orders/:id/invoice', () => {
    it('should create an invoice from completed work order', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });
      const workOrder = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'completed',
      });

      // Create cost for the work order
      await seedPrisma.workOrderCost.create({
        data: {
          workOrderId: workOrder.id,
          laborCost: 500,
          partsCost: 500,
          subtotal: 1000,
          taxRate: 0.21,
          taxAmount: 210,
          total: 1210,
          calculatedAt: new Date(),
        },
      });

      const createDto = { notes: 'Test invoice' };

      const response = await request(app.getHttpServer())
        .post(`/work-orders/${workOrder.id}/invoice`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.workOrderId).toBe(workOrder.id);
      expect(response.body.clientId).toBe(client.id);
      expect(response.body.status).toBe('pending');
      expect(response.body.totalAmount).toBe('1210');
      expect(response.body.invoiceNumber).toMatch(/^INV-\d{4}$/);

      // Verify work order status changed to 'invoiced'
      const updatedWorkOrder = await seedPrisma.workOrder.findUnique({
        where: { id: workOrder.id },
      });
      expect(updatedWorkOrder.milestone).toBe('invoiced');
    });

    it('should reject if work order not found', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma);
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .post(`/work-orders/${fakeId}/invoice`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(404);
    });

    it('should reject if work order not completed', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });
      const workOrder = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'in_progress',
      });

      await request(app.getHttpServer())
        .post(`/work-orders/${workOrder.id}/invoice`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });

    it('should reject if invoice already exists', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });
      const workOrder = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'completed',
      });

      // Create existing invoice
      await seedInvoice(seedPrisma, {
        tenantId,
        workOrderId: workOrder.id,
        clientId: client.id,
      });

      await request(app.getHttpServer())
        .post(`/work-orders/${workOrder.id}/invoice`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(409);
    });
  });

  describe('GET /invoices', () => {
    it('should return paginated invoices', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });
      const workOrder = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'invoiced',
      });

      await seedInvoice(seedPrisma, {
        tenantId,
        workOrderId: workOrder.id,
        clientId: client.id,
      });

      const response = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.total).toBe(1);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(20);
    });

    it('should filter by status', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });
      const workOrder1 = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'invoiced',
      });
      const workOrder2 = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'invoiced',
      });

      await seedInvoice(seedPrisma, {
        tenantId,
        workOrderId: workOrder1.id,
        clientId: client.id,
        status: 'pending',
      });
      await seedInvoice(seedPrisma, {
        tenantId,
        workOrderId: workOrder2.id,
        clientId: client.id,
        status: 'paid',
      });

      const response = await request(app.getHttpServer())
        .get('/invoices?status=pending')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('pending');
    });
  });

  describe('GET /invoices/:id', () => {
    it('should return invoice by id', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });
      const workOrder = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'invoiced',
      });
      const invoice = await seedInvoice(seedPrisma, {
        tenantId,
        workOrderId: workOrder.id,
        clientId: client.id,
      });

      const response = await request(app.getHttpServer())
        .get(`/invoices/${invoice.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(invoice.id);
      expect(response.body.invoiceNumber).toBe(invoice.invoiceNumber);
    });

    it('should return 404 if invoice not found', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma);
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .get(`/invoices/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('POST /invoices/:id/pay', () => {
    it('should register a partial payment', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });
      const workOrder = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'invoiced',
      });
      const invoice = await seedInvoice(seedPrisma, {
        tenantId,
        workOrderId: workOrder.id,
        clientId: client.id,
        totalAmount: 1000,
      });

      const paymentDto = {
        amount: 500,
        method: 'cash',
        reference: 'Test payment',
      };

      const response = await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(paymentDto)
        .expect(201);

      expect(response.body.payment).toBeDefined();
      expect(response.body.payment.amount).toBe('500');
      expect(response.body.invoice.status).toBe('partial');
      expect(response.body.invoice.paidAmount).toBe('500');
    });

    it('should register a full payment and update work order', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });
      const workOrder = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'invoiced',
      });
      const invoice = await seedInvoice(seedPrisma, {
        tenantId,
        workOrderId: workOrder.id,
        clientId: client.id,
        totalAmount: 1000,
      });

      const paymentDto = {
        amount: 1000,
        method: 'transfer',
      };

      const response = await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(paymentDto)
        .expect(201);

      expect(response.body.invoice.status).toBe('paid');
      expect(response.body.invoice.paidAmount).toBe('1000');

      // Verify work order status changed to 'paid'
      const updatedWorkOrder = await seedPrisma.workOrder.findUnique({
        where: { id: workOrder.id },
      });
      expect(updatedWorkOrder.milestone).toBe('paid');
    });

    it('should register an overpayment', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });
      const workOrder = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'invoiced',
      });
      const invoice = await seedInvoice(seedPrisma, {
        tenantId,
        workOrderId: workOrder.id,
        clientId: client.id,
        totalAmount: 1000,
      });

      const paymentDto = {
        amount: 1200,
        method: 'card',
      };

      const response = await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(paymentDto)
        .expect(201);

      expect(response.body.invoice.status).toBe('overpaid');
      expect(response.body.invoice.paidAmount).toBe('1200');
    });

    it('should return 404 if invoice not found', async () => {
      const { accessToken } = await seedActiveUserWithTenant(seedPrisma);
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .post(`/invoices/${fakeId}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 500, method: 'cash' })
        .expect(404);
    });

    it('should return 400 if invoice is cancelled', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });
      const workOrder = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'invoiced',
      });
      const invoice = await seedInvoice(seedPrisma, {
        tenantId,
        workOrderId: workOrder.id,
        clientId: client.id,
        status: 'cancelled',
      });

      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 500, method: 'cash' })
        .expect(400);
    });
  });
});
