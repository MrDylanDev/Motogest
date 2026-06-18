import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ExecutionsService } from '../checklists/executions.service';
import { WORK_ORDER_MILESTONES } from './constants/work-order-milestones';

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;

  const mockTenantId = '00000000-0000-0000-0000-000000000001';
  const mockVehicleId = '11111111-1111-1111-1111-111111111111';
  const mockClientId = '22222222-2222-2222-2222-222222222222';
  const mockWorkOrderId = '33333333-3333-3333-3333-333333333333';
  const mockMechanicId = '44444444-4444-4444-4444-444444444444';

  const mockTx = {
    vehicle: {
      findFirst: jest.fn(),
    },
    client: {
      findFirst: jest.fn(),
    },
    workOrder: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    mechanic: {
      findMany: jest.fn(),
    },
    workOrderMechanic: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockExecutionsService = {
    validateChecklistsForCompletion: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: PrismaService,
          useValue: {
            withRlsTransaction: jest.fn((callback) => callback(mockTx)),
          },
        },
        {
          provide: ExecutionsService,
          useValue: mockExecutionsService,
        },
      ],
    }).compile();

    service = module.get<WorkOrdersService>(WorkOrdersService);
  });

  describe('create', () => {
    const createDto = {
      vehicleId: mockVehicleId,
      clientId: mockClientId,
      description: 'Test work order',
      priority: 'normal',
    };

    it('should create a work order successfully', async () => {
      const mockVehicle = {
        id: mockVehicleId,
        clientId: mockClientId,
      };
      const mockClient = { id: mockClientId };
      const mockWorkOrder = {
        id: mockWorkOrderId,
        ...createDto,
        milestone: WORK_ORDER_MILESTONES.CREATED,
      };

      mockTx.vehicle.findFirst.mockResolvedValue(mockVehicle);
      mockTx.client.findFirst.mockResolvedValue(mockClient);
      mockTx.workOrder.create.mockResolvedValue(mockWorkOrder);

      const result = await service.create(mockTenantId, createDto);

      expect(result).toEqual(mockWorkOrder);
      expect(mockTx.workOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: mockTenantId,
          vehicleId: mockVehicleId,
          clientId: mockClientId,
          milestone: WORK_ORDER_MILESTONES.CREATED,
        }),
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if vehicle not found', async () => {
      mockTx.vehicle.findFirst.mockResolvedValue(null);

      await expect(service.create(mockTenantId, createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if client not found', async () => {
      mockTx.vehicle.findFirst.mockResolvedValue({
        id: mockVehicleId,
        clientId: mockClientId,
      });
      mockTx.client.findFirst.mockResolvedValue(null);

      await expect(service.create(mockTenantId, createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if vehicle does not belong to client', async () => {
      mockTx.vehicle.findFirst.mockResolvedValue({
        id: mockVehicleId,
        clientId: 'different-client-id',
      });
      mockTx.client.findFirst.mockResolvedValue({ id: mockClientId });

      await expect(service.create(mockTenantId, createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated work orders', async () => {
      const mockWorkOrders = [{ id: mockWorkOrderId, description: 'Test' }];
      mockTx.workOrder.findMany.mockResolvedValue(mockWorkOrders);
      mockTx.workOrder.count.mockResolvedValue(1);

      const result = await service.findAll(mockTenantId, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toEqual(mockWorkOrders);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('findOne', () => {
    it('should return a work order by id', async () => {
      const mockWorkOrder = { id: mockWorkOrderId, description: 'Test' };
      mockTx.workOrder.findFirst.mockResolvedValue(mockWorkOrder);

      const result = await service.findOne(mockTenantId, mockWorkOrderId);

      expect(result).toEqual(mockWorkOrder);
    });

    it('should throw NotFoundException if work order not found', async () => {
      mockTx.workOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(mockTenantId, mockWorkOrderId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('should cancel a work order', async () => {
      const mockWorkOrder = {
        id: mockWorkOrderId,
        milestone: WORK_ORDER_MILESTONES.CREATED,
      };
      const cancelledWorkOrder = {
        ...mockWorkOrder,
        milestone: WORK_ORDER_MILESTONES.CANCELLED,
      };

      mockTx.workOrder.findFirst.mockResolvedValue(mockWorkOrder);
      mockTx.workOrder.update.mockResolvedValue(cancelledWorkOrder);

      const result = await service.cancel(mockTenantId, mockWorkOrderId);

      expect(result.milestone).toBe(WORK_ORDER_MILESTONES.CANCELLED);
    });

    it('should throw BadRequestException if already cancelled', async () => {
      const mockWorkOrder = {
        id: mockWorkOrderId,
        milestone: WORK_ORDER_MILESTONES.CANCELLED,
      };

      mockTx.workOrder.findFirst.mockResolvedValue(mockWorkOrder);

      await expect(
        service.cancel(mockTenantId, mockWorkOrderId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('assignMechanics', () => {
    const assignDto = {
      mechanicIds: [mockMechanicId],
      primaryMechanicId: mockMechanicId,
    };

    it('should assign mechanics and auto-transition to assigned', async () => {
      const mockWorkOrder = {
        id: mockWorkOrderId,
        milestone: WORK_ORDER_MILESTONES.CREATED,
        mechanics: [],
      };
      const assignedWorkOrder = {
        ...mockWorkOrder,
        milestone: WORK_ORDER_MILESTONES.ASSIGNED,
        mechanics: [{ mechanicId: mockMechanicId }],
      };

      mockTx.workOrder.findFirst.mockResolvedValue(mockWorkOrder);
      mockTx.mechanic.findMany.mockResolvedValue([{ id: mockMechanicId }]);
      mockTx.workOrder.update.mockResolvedValue(assignedWorkOrder);

      const result = await service.assignMechanics(
        mockTenantId,
        mockWorkOrderId,
        assignDto,
      );

      expect(result.milestone).toBe(WORK_ORDER_MILESTONES.ASSIGNED);
      expect(mockTx.workOrderMechanic.deleteMany).toHaveBeenCalled();
      expect(mockTx.workOrderMechanic.createMany).toHaveBeenCalled();
    });

    it('should throw BadRequestException if work order is delivered', async () => {
      const mockWorkOrder = {
        id: mockWorkOrderId,
        milestone: WORK_ORDER_MILESTONES.DELIVERED,
        mechanics: [],
      };

      mockTx.workOrder.findFirst.mockResolvedValue(mockWorkOrder);

      await expect(
        service.assignMechanics(mockTenantId, mockWorkOrderId, assignDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if primary mechanic not in list', async () => {
      const mockWorkOrder = {
        id: mockWorkOrderId,
        milestone: WORK_ORDER_MILESTONES.CREATED,
        mechanics: [],
      };

      mockTx.workOrder.findFirst.mockResolvedValue(mockWorkOrder);

      const invalidDto = {
        mechanicIds: [mockMechanicId],
        primaryMechanicId: 'different-mechanic-id',
      };

      await expect(
        service.assignMechanics(mockTenantId, mockWorkOrderId, invalidDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('transitionMilestone', () => {
    it('should transition to in_progress and set startedAt', async () => {
      const mockWorkOrder = {
        id: mockWorkOrderId,
        milestone: WORK_ORDER_MILESTONES.ASSIGNED,
      };
      const transitionedWorkOrder = {
        ...mockWorkOrder,
        milestone: WORK_ORDER_MILESTONES.IN_PROGRESS,
        startedAt: new Date(),
      };

      mockTx.workOrder.findFirst.mockResolvedValue(mockWorkOrder);
      mockTx.workOrder.update.mockResolvedValue(transitionedWorkOrder);

      const result = await service.transitionMilestone(
        mockTenantId,
        mockWorkOrderId,
        {
          milestone: WORK_ORDER_MILESTONES.IN_PROGRESS,
        },
      );

      expect(result.milestone).toBe(WORK_ORDER_MILESTONES.IN_PROGRESS);
      expect(result.startedAt).toBeDefined();
    });

    it('should transition to completed and set completedAt', async () => {
      const mockWorkOrder = {
        id: mockWorkOrderId,
        milestone: WORK_ORDER_MILESTONES.IN_PROGRESS,
      };
      const transitionedWorkOrder = {
        ...mockWorkOrder,
        milestone: WORK_ORDER_MILESTONES.COMPLETED,
        completedAt: new Date(),
      };

      mockTx.workOrder.findFirst.mockResolvedValue(mockWorkOrder);
      mockTx.workOrder.update.mockResolvedValue(transitionedWorkOrder);

      const result = await service.transitionMilestone(
        mockTenantId,
        mockWorkOrderId,
        {
          milestone: WORK_ORDER_MILESTONES.COMPLETED,
        },
      );

      expect(result.milestone).toBe(WORK_ORDER_MILESTONES.COMPLETED);
      expect(result.completedAt).toBeDefined();
    });

    it('should throw BadRequestException for invalid transition', async () => {
      const mockWorkOrder = {
        id: mockWorkOrderId,
        milestone: WORK_ORDER_MILESTONES.CREATED,
      };

      mockTx.workOrder.findFirst.mockResolvedValue(mockWorkOrder);

      await expect(
        service.transitionMilestone(mockTenantId, mockWorkOrderId, {
          milestone: WORK_ORDER_MILESTONES.COMPLETED,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
