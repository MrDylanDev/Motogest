import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../common/prisma';
import { Decimal } from '@prisma/client/runtime/library';

describe('PaymentsService', () => {
  let service: PaymentsService;

  const mockTenantId = '00000000-0000-0000-0000-000000000001';
  const mockInvoiceId = '66666666-6666-6666-6666-666666666666';
  const mockWorkOrderId = '33333333-3333-3333-3333-333333333333';
  const mockUserId = '55555555-5555-5555-5555-555555555555';

  const mockTx = {
    invoice: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    workOrder: {
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: {
            withRlsTransaction: jest.fn((callback) => callback(mockTx)),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('registerPayment', () => {
    const mockInvoice = {
      id: mockInvoiceId,
      tenantId: mockTenantId,
      workOrderId: mockWorkOrderId,
      totalAmount: new Decimal(1210),
      paidAmount: new Decimal(0),
      status: 'pending',
      workOrder: {
        id: mockWorkOrderId,
        milestone: 'invoiced',
      },
    };

    const mockPayment = {
      id: '77777777-7777-7777-7777-777777777777',
      amount: new Decimal(500),
      method: 'cash',
    };

    it('should register a partial payment', async () => {
      mockTx.invoice.findFirst.mockResolvedValue(mockInvoice);
      mockTx.payment.create.mockResolvedValue(mockPayment);
      mockTx.payment.aggregate.mockResolvedValue({
        _sum: { amount: new Decimal(500) },
      });
      mockTx.invoice.update.mockResolvedValue({
        ...mockInvoice,
        paidAmount: new Decimal(500),
        status: 'partial',
        payments: [mockPayment],
      });

      const result = await service.registerPayment(
        mockTenantId,
        mockInvoiceId,
        { amount: 500, method: 'cash' },
        mockUserId,
      );

      expect(result.payment).toEqual(mockPayment);
      expect(result.invoice.status).toBe('partial');
      expect(mockTx.workOrder.update).not.toHaveBeenCalled();
    });

    it('should register a full payment and update work order', async () => {
      mockTx.invoice.findFirst.mockResolvedValue(mockInvoice);
      mockTx.payment.create.mockResolvedValue(mockPayment);
      mockTx.payment.aggregate.mockResolvedValue({
        _sum: { amount: new Decimal(1210) },
      });
      mockTx.invoice.update.mockResolvedValue({
        ...mockInvoice,
        paidAmount: new Decimal(1210),
        status: 'paid',
        payments: [mockPayment],
      });
      mockTx.workOrder.update.mockResolvedValue({});

      const result = await service.registerPayment(
        mockTenantId,
        mockInvoiceId,
        { amount: 1210, method: 'cash' },
        mockUserId,
      );

      expect(result.invoice.status).toBe('paid');
      expect(mockTx.workOrder.update).toHaveBeenCalledWith({
        where: { id: mockWorkOrderId },
        data: { milestone: 'paid' },
      });
    });

    it('should register an overpayment', async () => {
      mockTx.invoice.findFirst.mockResolvedValue(mockInvoice);
      mockTx.payment.create.mockResolvedValue(mockPayment);
      mockTx.payment.aggregate.mockResolvedValue({
        _sum: { amount: new Decimal(1500) },
      });
      mockTx.invoice.update.mockResolvedValue({
        ...mockInvoice,
        paidAmount: new Decimal(1500),
        status: 'overpaid',
        payments: [mockPayment],
      });

      const result = await service.registerPayment(
        mockTenantId,
        mockInvoiceId,
        { amount: 1500, method: 'cash' },
        mockUserId,
      );

      expect(result.invoice.status).toBe('overpaid');
    });

    it('should throw NotFoundException if invoice not found', async () => {
      mockTx.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.registerPayment(
          mockTenantId,
          mockInvoiceId,
          { amount: 500, method: 'cash' },
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if invoice is cancelled', async () => {
      mockTx.invoice.findFirst.mockResolvedValue({
        ...mockInvoice,
        status: 'cancelled',
      });

      await expect(
        service.registerPayment(
          mockTenantId,
          mockInvoiceId,
          { amount: 500, method: 'cash' },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
