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

describe('Invoice Integration Flow (e2e)', () => {
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

  describe('Complete Flow: WorkOrder → Invoice → Payments → Paid', () => {
    it('should complete full invoice lifecycle', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });

      // 1. Create and complete work order
      const workOrder = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'completed',
      });

      // Add cost to work order
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

      // 2. Create invoice
      const invoiceResponse = await request(app.getHttpServer())
        .post(`/work-orders/${workOrder.id}/invoice`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ notes: 'Integration test invoice' })
        .expect(201);

      expect(invoiceResponse.body.status).toBe('pending');
      expect(invoiceResponse.body.totalAmount).toBe('1210');
      expect(invoiceResponse.body.paidAmount).toBe('0');

      const invoiceId = invoiceResponse.body.id;

      // Verify work order status changed
      const woAfterInvoice = await seedPrisma.workOrder.findUnique({
        where: { id: workOrder.id },
      });
      expect(woAfterInvoice.milestone).toBe('invoiced');

      // 3. Register partial payment
      const payment1Response = await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 500,
          method: 'cash',
          reference: 'First payment',
        })
        .expect(201);

      expect(payment1Response.body.invoice.status).toBe('partial');
      expect(payment1Response.body.invoice.paidAmount).toBe('500');

      // 4. Register remaining payment
      const payment2Response = await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 710,
          method: 'transfer',
          reference: 'Final payment',
        })
        .expect(201);

      expect(payment2Response.body.invoice.status).toBe('paid');
      expect(payment2Response.body.invoice.paidAmount).toBe('1210');

      // Verify work order status changed to paid
      const woAfterPayment = await seedPrisma.workOrder.findUnique({
        where: { id: workOrder.id },
      });
      expect(woAfterPayment.milestone).toBe('paid');

      // 5. Verify invoice has all payments
      const invoiceDetail = await request(app.getHttpServer())
        .get(`/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(invoiceDetail.body.payments).toHaveLength(2);
      expect(invoiceDetail.body.status).toBe('paid');
    });
  });

  describe('Cancellation Flow', () => {
    it('should cancel invoice and revert work order', async () => {
      const { accessToken, tenantId, userId } =
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
        status: 'partial',
        totalAmount: 1000,
        paidAmount: 300,
      });

      // Add a payment
      await seedPrisma.payment.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          amount: 300,
          method: 'cash',
          receivedBy: userId,
        },
      });

      // Cancel invoice
      const cancelResponse = await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(cancelResponse.body.status).toBe('cancelled');
      expect(cancelResponse.body.paidAmount).toBe('0');

      // Verify payments deleted
      const payments = await seedPrisma.payment.findMany({
        where: { invoiceId: invoice.id },
      });
      expect(payments).toHaveLength(0);

      // Verify work order reverted
      const woAfterCancel = await seedPrisma.workOrder.findUnique({
        where: { id: workOrder.id },
      });
      expect(woAfterCancel.milestone).toBe('completed');
    });
  });

  describe('Report Summary Integration', () => {
    it('should calculate correct totals across multiple invoices', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });

      // Create invoices with different statuses
      const wo1 = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'invoiced',
      });
      await seedInvoice(seedPrisma, {
        tenantId,
        workOrderId: wo1.id,
        clientId: client.id,
        status: 'pending',
        totalAmount: 1000,
        paidAmount: 0,
      });

      const wo2 = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'invoiced',
      });
      await seedInvoice(seedPrisma, {
        tenantId,
        workOrderId: wo2.id,
        clientId: client.id,
        status: 'partial',
        totalAmount: 2000,
        paidAmount: 500,
      });

      const wo3 = await seedWorkOrder(seedPrisma, {
        tenantId,
        vehicleId: vehicle.id,
        clientId: client.id,
        milestone: 'paid',
      });
      await seedInvoice(seedPrisma, {
        tenantId,
        workOrderId: wo3.id,
        clientId: client.id,
        status: 'paid',
        totalAmount: 1500,
        paidAmount: 1500,
      });

      // Get report
      const reportResponse = await request(app.getHttpServer())
        .get('/invoices/reports/summary')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(reportResponse.body.totalIssued).toBe(4500);
      expect(reportResponse.body.totalPaid).toBe(2000);
      expect(reportResponse.body.totalPending).toBe(2500);
      expect(reportResponse.body.invoicesByStatus).toEqual({
        pending: 1,
        partial: 1,
        paid: 1,
        overpaid: 0,
      });
    });
  });
});
