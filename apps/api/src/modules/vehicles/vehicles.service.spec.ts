import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('VehiclesService', () => {
  let service: VehiclesService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const mockTenantId = '00000000-0000-0000-0000-000000000001';
  const mockClientId = '11111111-1111-1111-1111-111111111111';
  const mockVehicleId = '22222222-2222-2222-2222-222222222222';

  const createMockTx = () => ({
    client: {
      findFirst: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  });

  const mockVehicle = {
    id: mockVehicleId,
    tenantId: mockTenantId,
    clientId: mockClientId,
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    plate: 'ABC123',
    vin: '1HGBH41JXMN109186',
    color: 'Red',
    fuelType: 'gasoline',
    mileage: 50000,
    notes: 'Test notes',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    client: {
      id: mockClientId,
      name: 'John Doe',
      email: 'john@example.com',
      phone: '1234567890',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        {
          provide: PrismaService,
          useValue: {
            withRlsTransaction: jest.fn(
              async (fn: (tx: unknown) => Promise<unknown>) =>
                fn(createMockTx()),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<VehiclesService>(VehiclesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create', () => {
    const createDto = {
      clientId: mockClientId,
      make: 'Toyota',
      model: 'Corolla',
      year: 2020,
      plate: 'ABC123',
      vin: '1HGBH41JXMN109186',
      color: 'Red',
      fuelType: 'gasoline',
      mileage: 50000,
      notes: 'Test notes',
    };

    it('should create a vehicle successfully', async () => {
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue({ id: mockClientId });
      mockTx.vehicle.findFirst.mockResolvedValue(null);
      mockTx.vehicle.create.mockResolvedValue(mockVehicle);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.create(mockTenantId, createDto);

      expect(result).toEqual(mockVehicle);
    });

    it('should throw NotFoundException if client does not exist', async () => {
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue(null);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(service.create(mockTenantId, createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if plate already exists', async () => {
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue({ id: mockClientId });
      mockTx.vehicle.findFirst.mockResolvedValue({ id: 'existing-vehicle' });
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(service.create(mockTenantId, createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if VIN already exists', async () => {
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue({ id: mockClientId });
      mockTx.vehicle.findFirst
        .mockResolvedValueOnce(null) // plate check
        .mockResolvedValueOnce({ id: 'existing-vehicle' }); // VIN check
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(service.create(mockTenantId, createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated vehicles', async () => {
      const query = { page: 1, limit: 10 };
      const mockTx = createMockTx();
      mockTx.vehicle.findMany.mockResolvedValue([mockVehicle]);
      mockTx.vehicle.count.mockResolvedValue(1);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.findAll(mockTenantId, query);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by clientId', async () => {
      const query = { clientId: mockClientId };
      const mockTx = createMockTx();
      mockTx.vehicle.findMany.mockResolvedValue([]);
      mockTx.vehicle.count.mockResolvedValue(0);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await service.findAll(mockTenantId, query);

      expect(prisma.withRlsTransaction).toHaveBeenCalled();
    });

    it('should search in multiple fields', async () => {
      const query = { search: 'Toyota' };
      const mockTx = createMockTx();
      mockTx.vehicle.findMany.mockResolvedValue([]);
      mockTx.vehicle.count.mockResolvedValue(0);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await service.findAll(mockTenantId, query);

      expect(prisma.withRlsTransaction).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a vehicle by id', async () => {
      const mockTx = createMockTx();
      mockTx.vehicle.findFirst.mockResolvedValue(mockVehicle);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.findOne(mockTenantId, mockVehicleId);

      expect(result).toEqual(mockVehicle);
    });

    it('should throw NotFoundException if vehicle does not exist', async () => {
      const mockTx = createMockTx();
      mockTx.vehicle.findFirst.mockResolvedValue(null);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.findOne(mockTenantId, mockVehicleId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto = {
      make: 'Honda',
      model: 'Civic',
    };

    it('should update a vehicle successfully', async () => {
      const updatedVehicle = { ...mockVehicle, ...updateDto };
      const mockTx = createMockTx();
      mockTx.vehicle.findFirst.mockResolvedValue(mockVehicle);
      mockTx.vehicle.update.mockResolvedValue(updatedVehicle);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.update(
        mockTenantId,
        mockVehicleId,
        updateDto,
      );

      expect(result).toEqual(updatedVehicle);
    });

    it('should throw NotFoundException if vehicle does not exist', async () => {
      const mockTx = createMockTx();
      mockTx.vehicle.findFirst.mockResolvedValue(null);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.update(mockTenantId, mockVehicleId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if new plate already exists', async () => {
      const mockTx = createMockTx();
      mockTx.vehicle.findFirst
        .mockResolvedValueOnce(mockVehicle) // vehicle exists
        .mockResolvedValueOnce({ id: 'other-vehicle' }); // plate exists
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.update(mockTenantId, mockVehicleId, { plate: 'XYZ789' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should soft delete a vehicle', async () => {
      const inactiveVehicle = { ...mockVehicle, status: 'inactive' };
      const mockTx = createMockTx();
      mockTx.vehicle.findFirst.mockResolvedValue(mockVehicle);
      mockTx.vehicle.update.mockResolvedValue(inactiveVehicle);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.remove(mockTenantId, mockVehicleId);

      expect(result.status).toBe('inactive');
    });

    it('should throw NotFoundException if vehicle does not exist', async () => {
      const mockTx = createMockTx();
      mockTx.vehicle.findFirst.mockResolvedValue(null);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(service.remove(mockTenantId, mockVehicleId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
