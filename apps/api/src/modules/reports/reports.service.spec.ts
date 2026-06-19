import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: PrismaService;

  const mockTx = {
    client: {
      count: jest.fn(),
    },
    vehicle: {
      count: jest.fn(),
    },
    mechanic: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    workOrder: {
      groupBy: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    invoice: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    sparePart: {
      count: jest.fn(),
      findMany: jest.fn(),
      fields: {
        minStock: 'minStock',
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: PrismaService,
          useValue: {
            withRlsTransaction: jest.fn((callback) => callback()),
            scoped: jest.fn(() => mockTx),
          },
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardMetrics', () => {
    it('should return dashboard metrics', async () => {
      mockTx.client.count.mockResolvedValue(10);
      mockTx.vehicle.count.mockResolvedValue(15);
      mockTx.mechanic.count.mockResolvedValue(3);
      mockTx.workOrder.groupBy.mockResolvedValue([
        { milestone: 'created', _count: 2 },
        { milestone: 'in_progress', _count: 3 },
        { milestone: 'completed', _count: 5 },
      ]);
      mockTx.invoice.aggregate.mockResolvedValueOnce({
        _sum: { totalAmount: new Decimal(50000) },
      });
      mockTx.invoice.aggregate.mockResolvedValueOnce({
        _sum: { totalAmount: new Decimal(15000) },
      });
      mockTx.sparePart.findMany.mockResolvedValue([
        { currentStock: 5, minStock: 10 },
        { currentStock: 15, minStock: 10 },
        { currentStock: 8, minStock: 10 },
      ]);

      const result = await service.getDashboardMetrics();

      expect(result).toEqual({
        totalClients: 10,
        totalVehicles: 15,
        totalMechanics: 3,
        workOrdersByStatus: {
          created: 2,
          in_progress: 3,
          completed: 5,
        },
        monthlyRevenue: 50000,
        pendingRevenue: 15000,
        lowStockParts: 2,
      });

      // Verify prisma.scoped() was called
      expect(prisma.scoped).toHaveBeenCalled();
    });

    it('should handle empty data', async () => {
      mockTx.client.count.mockResolvedValue(0);
      mockTx.vehicle.count.mockResolvedValue(0);
      mockTx.mechanic.count.mockResolvedValue(0);
      mockTx.workOrder.groupBy.mockResolvedValue([]);
      mockTx.invoice.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
      });
      mockTx.invoice.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
      });
      mockTx.sparePart.findMany.mockResolvedValue([]);

      const result = await service.getDashboardMetrics();

      expect(result).toEqual({
        totalClients: 0,
        totalVehicles: 0,
        totalMechanics: 0,
        workOrdersByStatus: {},
        monthlyRevenue: 0,
        pendingRevenue: 0,
        lowStockParts: 0,
      });
    });
  });

  describe('getRevenueReport', () => {
    it('should return revenue report', async () => {
      const mockInvoices = [
        {
          id: '1',
          invoiceNumber: 'INV-001',
          issueDate: new Date('2024-01-15'),
          totalAmount: new Decimal(10000),
          paidAmount: new Decimal(10000),
          status: 'paid',
          client: { name: 'Client 1' },
        },
        {
          id: '2',
          invoiceNumber: 'INV-002',
          issueDate: new Date('2024-01-20'),
          totalAmount: new Decimal(5000),
          paidAmount: new Decimal(2500),
          status: 'partial',
          client: { name: 'Client 2' },
        },
      ];

      mockTx.invoice.findMany.mockResolvedValue(mockInvoices);

      const result = await service.getRevenueReport();

      expect(result.totalRevenue).toBe(15000);
      expect(result.totalPaid).toBe(12500);
      expect(result.totalPending).toBe(2500);
      expect(result.invoices).toHaveLength(2);

      // Verify prisma.scoped() was called
      expect(prisma.scoped).toHaveBeenCalled();
    });
  });

  describe('getMechanicPerformance', () => {
    it('should return mechanic performance metrics', async () => {
      const mockMechanics = [
        {
          id: '1',
          name: 'Mechanic 1',
          workOrders: [
            {
              workOrder: {
                startedAt: new Date('2024-01-01T10:00:00'),
                completedAt: new Date('2024-01-01T14:00:00'),
                cost: { laborCost: new Decimal(4000) },
              },
            },
            {
              workOrder: {
                startedAt: new Date('2024-01-02T09:00:00'),
                completedAt: new Date('2024-01-02T12:00:00'),
                cost: { laborCost: new Decimal(3000) },
              },
            },
          ],
        },
      ];

      mockTx.mechanic.findMany.mockResolvedValue(mockMechanics);

      const result = await service.getMechanicPerformance();

      expect(result).toHaveLength(1);
      expect(result[0].mechanicName).toBe('Mechanic 1');
      expect(result[0].completedOrders).toBe(2);
      expect(result[0].totalLaborCost).toBe(7000);
      expect(result[0].avgRepairTimeHours).toBe(3.5);

      // Verify prisma.scoped() was called
      expect(prisma.scoped).toHaveBeenCalled();
    });
  });

  describe('getWorkOrderStats', () => {
    it('should return work order stats', async () => {
      mockTx.workOrder.count.mockResolvedValueOnce(10); // completedThisMonth
      mockTx.workOrder.count.mockResolvedValueOnce(3); // inProgress

      const mockRecentOrders = [
        {
          startedAt: new Date('2024-01-01T10:00:00'),
          completedAt: new Date('2024-01-01T14:00:00'),
        },
        {
          startedAt: new Date('2024-01-02T09:00:00'),
          completedAt: new Date('2024-01-02T12:00:00'),
        },
      ];

      mockTx.workOrder.findMany.mockResolvedValue(mockRecentOrders);

      const result = await service.getWorkOrderStats();

      expect(result.completedThisMonth).toBe(10);
      expect(result.inProgress).toBe(3);
      expect(result.avgCompletionTimeHours).toBe(3.5);

      // Verify prisma.scoped() was called
      expect(prisma.scoped).toHaveBeenCalled();
    });
  });
});
