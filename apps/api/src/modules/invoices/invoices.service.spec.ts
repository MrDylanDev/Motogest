import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

describe('InvoicesService', () => {
  let service: InvoicesService;

  const mockTenantId = '00000000-0000-0000-0000-000000000001';
  const mockWorkOrderId = '33333333-3333-3333-3333-333333333333';
  const mockClientId = '22222222-2222-2222-2222-222222222222';
  const mockInvoiceId = '66666666-6666-6666-6666-666666666666';

  const mockTx = {
    workOrder: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    invoice: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        {
          provide: PrismaService,
          useValue: {
            withRlsTransaction: jest.fn((callback) => callback(mockTx)),
          },
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  describe('createInvoice', () => {
    const createDto = { notes: 'Test invoice' };

    const mockWorkOrder = {
      id: mockWorkOrderId,
      tenantId: mockTenantId,
      clientId: mockClientId,
      milestone: 'completed',
      cost: {
        subtotal: new Decimal(1000),
        taxRate: new Decimal(0.21),
        taxAmount: new Decimal(210),
        total: new Decimal(1210),
      },
      client: { id: mockClientId, name: 'Test Client' },
    };

    const mockInvoice = {
      id: mockInvoiceId,
      tenantId: mockTenantId,
      workOrderId: mockWorkOrderId,
      clientId: mockClientId,
      invoiceNumber: 'INV-0001',
      status: 'pending',
      subtotal: new Decimal(1000),
      taxRate: new Decimal(0.21),
      taxAmount: new Decimal(210),
      totalAmount: new Decimal(1210),
      paidAmount: new Decimal(0),
      notes: 'Test invoice',
    };

    it('should create an invoice successfully', async () => {
      mockTx.workOrder.findFirst.mockResolvedValue(mockWorkOrder);
      mockTx.invoice.findFirst.mockResolvedValue(null);
      mockTx.invoice.create.mockResolvedValue(mockInvoice);
      mockTx.workOrder.update.mockResolvedValue({});

      const result = await service.createInvoice(
        mockTenantId,
        mockWorkOrderId,
        createDto,
      );

      expect(result).toEqual(mockInvoice);
      expect(mockTx.workOrder.findFirst).toHaveBeenCalledWith({
        where: { id: mockWorkOrderId, tenantId: mockTenantId },
        include: { cost: true, client: true },
      });
      expect(mockTx.invoice.create).toHaveBeenCalled();
      expect(mockTx.workOrder.update).toHaveBeenCalledWith({
        where: { id: mockWorkOrderId },
        data: { milestone: 'invoiced' },
      });
    });

    it('should throw NotFoundException if WorkOrder not found', async () => {
      mockTx.workOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.createInvoice(mockTenantId, mockWorkOrderId, createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if WorkOrder not completed', async () => {
      mockTx.workOrder.findFirst.mockResolvedValue({
        ...mockWorkOrder,
        milestone: 'in_progress',
      });

      await expect(
        service.createInvoice(mockTenantId, mockWorkOrderId, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if invoice already exists', async () => {
      mockTx.workOrder.findFirst.mockResolvedValue(mockWorkOrder);
      mockTx.invoice.findFirst.mockResolvedValue({ id: 'existing-invoice' });

      await expect(
        service.createInvoice(mockTenantId, mockWorkOrderId, createDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if WorkOrder has no cost', async () => {
      mockTx.workOrder.findFirst.mockResolvedValue({
        ...mockWorkOrder,
        cost: null,
      });

      await expect(
        service.createInvoice(mockTenantId, mockWorkOrderId, createDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    const mockInvoices = [
      {
        id: mockInvoiceId,
        invoiceNumber: 'INV-0001',
        status: 'pending',
        client: { id: mockClientId, name: 'Test Client' },
        workOrder: { id: mockWorkOrderId },
        payments: [],
      },
    ];

    it('should return paginated invoices', async () => {
      mockTx.invoice.findMany.mockResolvedValue(mockInvoices);
      mockTx.invoice.count.mockResolvedValue(1);

      const result = await service.findAll(mockTenantId, {
        page: 1,
        limit: 20,
      });

      expect(result).toEqual({
        data: mockInvoices,
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('should filter by status', async () => {
      mockTx.invoice.findMany.mockResolvedValue([]);
      mockTx.invoice.count.mockResolvedValue(0);

      await service.findAll(mockTenantId, { status: 'pending' });

      expect(mockTx.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'pending' }),
        }),
      );
    });

    it('should filter by clientId', async () => {
      mockTx.invoice.findMany.mockResolvedValue([]);
      mockTx.invoice.count.mockResolvedValue(0);

      await service.findAll(mockTenantId, { clientId: mockClientId });

      expect(mockTx.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientId: mockClientId }),
        }),
      );
    });

    it('should restrict mechanic to own work orders', async () => {
      mockTx.invoice.findMany.mockResolvedValue([]);
      mockTx.invoice.count.mockResolvedValue(0);

      await service.findAll(mockTenantId, {}, 'mechanic-id', 'mecanico');

      expect(mockTx.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workOrder: {
              mechanics: { some: { mechanicId: 'mechanic-id' } },
            },
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    const mockInvoice = {
      id: mockInvoiceId,
      invoiceNumber: 'INV-0001',
      status: 'pending',
      client: { id: mockClientId, name: 'Test Client' },
      workOrder: { id: mockWorkOrderId },
      payments: [],
    };

    it('should return invoice by id', async () => {
      mockTx.invoice.findFirst.mockResolvedValue(mockInvoice);

      const result = await service.findOne(mockTenantId, mockInvoiceId);

      expect(result).toEqual(mockInvoice);
    });

    it('should throw NotFoundException if invoice not found', async () => {
      mockTx.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(mockTenantId, mockInvoiceId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
