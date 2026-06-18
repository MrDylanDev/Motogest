import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { MechanicsService } from './mechanics.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('MechanicsService', () => {
  let service: MechanicsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const mockTenantId = '00000000-0000-0000-0000-000000000001';
  const mockMechanicId = '22222222-2222-2222-2222-222222222222';

  const createMockTx = () => ({
    mechanic: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  });

  const mockMechanic = {
    id: mockMechanicId,
    tenantId: mockTenantId,
    name: 'John Mechanic',
    email: 'john@mechanic.com',
    phone: '1234567890',
    specializations: ['engine', 'brakes'],
    hireDate: new Date('2020-01-15'),
    notes: 'Test notes',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MechanicsService,
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

    service = module.get<MechanicsService>(MechanicsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create', () => {
    const createDto = {
      name: 'John Mechanic',
      email: 'john@mechanic.com',
      phone: '1234567890',
      specializations: ['engine', 'brakes'],
      hireDate: '2020-01-15',
      notes: 'Test notes',
    };

    it('should create a mechanic successfully', async () => {
      const mockTx = createMockTx();
      mockTx.mechanic.findFirst.mockResolvedValue(null);
      mockTx.mechanic.create.mockResolvedValue(mockMechanic);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.create(mockTenantId, createDto);

      expect(result).toEqual(mockMechanic);
    });

    it('should create a mechanic without optional fields', async () => {
      const minimalDto = { name: 'John Mechanic' };
      const minimalMechanic = {
        ...mockMechanic,
        email: null,
        phone: null,
        specializations: [],
        hireDate: null,
        notes: null,
      };
      const mockTx = createMockTx();
      mockTx.mechanic.findFirst.mockResolvedValue(null);
      mockTx.mechanic.create.mockResolvedValue(minimalMechanic);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.create(mockTenantId, minimalDto);

      expect(result).toEqual(minimalMechanic);
    });

    it('should throw ConflictException if email already exists', async () => {
      const mockTx = createMockTx();
      mockTx.mechanic.findFirst.mockResolvedValue({ id: 'existing-mechanic' });
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(service.create(mockTenantId, createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if phone already exists', async () => {
      const mockTx = createMockTx();
      mockTx.mechanic.findFirst
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ id: 'existing-mechanic' }); // phone check
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(service.create(mockTenantId, createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated mechanics', async () => {
      const query = { page: 1, limit: 10 };
      const mockTx = createMockTx();
      mockTx.mechanic.findMany.mockResolvedValue([mockMechanic]);
      mockTx.mechanic.count.mockResolvedValue(1);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.findAll(mockTenantId, query);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by status', async () => {
      const query = { status: 'active' };
      const mockTx = createMockTx();
      mockTx.mechanic.findMany.mockResolvedValue([]);
      mockTx.mechanic.count.mockResolvedValue(0);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await service.findAll(mockTenantId, query);

      expect(prisma.withRlsTransaction).toHaveBeenCalled();
    });

    it('should filter by specialization', async () => {
      const query = { specialization: 'engine' };
      const mockTx = createMockTx();
      mockTx.mechanic.findMany.mockResolvedValue([]);
      mockTx.mechanic.count.mockResolvedValue(0);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await service.findAll(mockTenantId, query);

      expect(prisma.withRlsTransaction).toHaveBeenCalled();
    });

    it('should search in multiple fields', async () => {
      const query = { search: 'John' };
      const mockTx = createMockTx();
      mockTx.mechanic.findMany.mockResolvedValue([]);
      mockTx.mechanic.count.mockResolvedValue(0);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await service.findAll(mockTenantId, query);

      expect(prisma.withRlsTransaction).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a mechanic by id', async () => {
      const mockTx = createMockTx();
      mockTx.mechanic.findFirst.mockResolvedValue(mockMechanic);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.findOne(mockTenantId, mockMechanicId);

      expect(result).toEqual(mockMechanic);
    });

    it('should throw NotFoundException if mechanic does not exist', async () => {
      const mockTx = createMockTx();
      mockTx.mechanic.findFirst.mockResolvedValue(null);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.findOne(mockTenantId, mockMechanicId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto = {
      name: 'John Updated',
      specializations: ['engine', 'brakes', 'suspension'],
    };

    it('should update a mechanic successfully', async () => {
      const updatedMechanic = { ...mockMechanic, ...updateDto };
      const mockTx = createMockTx();
      mockTx.mechanic.findFirst.mockResolvedValue(mockMechanic);
      mockTx.mechanic.update.mockResolvedValue(updatedMechanic);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.update(
        mockTenantId,
        mockMechanicId,
        updateDto,
      );

      expect(result).toEqual(updatedMechanic);
    });

    it('should throw NotFoundException if mechanic does not exist', async () => {
      const mockTx = createMockTx();
      mockTx.mechanic.findFirst.mockResolvedValue(null);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.update(mockTenantId, mockMechanicId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if new email already exists', async () => {
      const mockTx = createMockTx();
      mockTx.mechanic.findFirst
        .mockResolvedValueOnce(mockMechanic) // mechanic exists
        .mockResolvedValueOnce({ id: 'other-mechanic' }); // email exists
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.update(mockTenantId, mockMechanicId, {
          email: 'taken@email.com',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if new phone already exists', async () => {
      const mockTx = createMockTx();
      mockTx.mechanic.findFirst
        .mockResolvedValueOnce(mockMechanic) // mechanic exists
        .mockResolvedValueOnce({ id: 'other-mechanic' }); // phone exists
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.update(mockTenantId, mockMechanicId, { phone: '9999999999' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should soft delete a mechanic', async () => {
      const inactiveMechanic = { ...mockMechanic, status: 'inactive' };
      const mockTx = createMockTx();
      mockTx.mechanic.findFirst.mockResolvedValue(mockMechanic);
      mockTx.mechanic.update.mockResolvedValue(inactiveMechanic);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.remove(mockTenantId, mockMechanicId);

      expect(result.status).toBe('inactive');
    });

    it('should throw NotFoundException if mechanic does not exist', async () => {
      const mockTx = createMockTx();
      mockTx.mechanic.findFirst.mockResolvedValue(null);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.remove(mockTenantId, mockMechanicId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
