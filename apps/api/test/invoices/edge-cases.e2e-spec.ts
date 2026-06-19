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

describe('Invoice Edge Cases (e2e)', () => {
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

  describe('Overpayment Handling', () => {
    it('should allow overpayment and set status to overpaid', async () => {
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

      const paymentResponse = await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 1200, // More than total
          method: 'cash',
        })
        .expect(201);

      expect(paymentResponse.body.invoice.status).toBe('overpaid');
      expect(paymentResponse.body.invoice.paidAmount).toBe('1200');
    });
  });

  describe('Duplicate Invoice Prevention', () => {
    it('should prevent duplicate invoice for same work order', async () => {
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

      // Add cost
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

      // Create first invoice
      await request(app.getHttpServer())
        .post(`/work-orders/${workOrder.id}/invoice`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(201);

      // Try to create duplicate
      await request(app.getHttpServer())
        .post(`/work-orders/${workOrder.id}/invoice`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(409);
    });
  });

  describe('Invalid Payment Amounts', () => {
    it('should reject zero amount payment', async () => {
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

      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 0,
          method: 'cash',
        })
        .expect(400);
    });

    it('should reject negative amount payment', async () => {
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

      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: -100,
          method: 'cash',
        })
        .expect(400);
    });

    it('should reject payment with invalid method', async () => {
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

      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 100,
          method: 'bitcoin', // Invalid
        })
        .expect(400);
    });
  });

  describe('Invoice Number Generation', () => {
    it('should generate sequential invoice numbers', async () => {
      const { accessToken, tenantId } =
        await seedActiveUserWithTenant(seedPrisma);
      const client = await seedClient(seedPrisma, { tenantId });
      const vehicle = await seedVehicle(seedPrisma, {
        tenantId,
        clientId: client.id,
      });

      const invoiceNumbers = [];

      for (let i = 0; i < 3; i++) {
        const workOrder = await seedWorkOrder(seedPrisma, {
          tenantId,
          vehicleId: vehicle.id,
          clientId: client.id,
          milestone: 'completed',
        });

        await seedPrisma.workOrderCost.create({
          data: {
            workOrderId: workOrder.id,
            laborCost: 100 * (i + 1),
            partsCost: 0,
            subtotal: 100 * (i + 1),
            taxRate: 0.21,
            taxAmount: 21 * (i + 1),
            total: 121 * (i + 1),
            calculatedAt: new Date(),
          },
        });

        const response = await request(app.getHttpServer())
          .post(`/work-orders/${workOrder.id}/invoice`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({});

        invoiceNumbers.push(response.body.invoiceNumber);
      }

      // Verify sequential numbers
      expect(invoiceNumbers[0]).toMatch(/^INV-\d{4}$/);
      expect(invoiceNumbers[1]).toMatch(/^INV-\d{4}$/);
      expect(invoiceNumbers[2]).toMatch(/^INV-\d{4}$/);

      const num1 = parseInt(invoiceNumbers[0].split('-')[1]);
      const num2 = parseInt(invoiceNumbers[1].split('-')[1]);
      const num3 = parseInt(invoiceNumbers[2].split('-')[1]);

      expect(num2).toBe(num1 + 1);
      expect(num3).toBe(num2 + 1);
    });
  });

  describe('Cannot Pay Cancelled Invoice', () => {
    it('should reject payment on cancelled invoice', async () => {
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
      const invoice = await seedInvoice(seedPrisma, {
        tenantId,
        workOrderId: workOrder.id,
        clientId: client.id,
        status: 'cancelled',
      });

      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 100,
          method: 'cash',
        })
        .expect(400);
    });
  });
});
