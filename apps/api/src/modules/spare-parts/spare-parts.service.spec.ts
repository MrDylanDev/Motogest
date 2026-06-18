import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SparePartsService } from './spare-parts.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('SparePartsService', () => {
  let service: SparePartsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const mockTenantId = '00000000-0000-0000-0000-000000000001';
  const mockSparePartId = '22222222-2222-2222-2222-222222222222';

  const createMockTx = () => ({
    sparePart: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  });

  const mockSparePart = {
    id: mockSparePartId,
    tenantId: mockTenantId,
    code: 'SP-001',
    name: 'Brake Pad',
    description: 'Front brake pad',
    category: 'brakes',
    unit: 'unit',
    currentStock: 10,
    minStock: 5,
    maxStock: 50,
    unitCost: 25.5,
    sellingPrice: 45.0,
    supplier: 'AutoParts Inc',
    notes: 'Test notes',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SparePartsService,
        {
          provide: PrismaService,
          useValue: {
            withRlsTransaction: jest.fn(
              async (fn: (tx: unknown) => Promise<unknown>) =>
                fn(createMockTx()),
            ),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SparePartsService>(SparePartsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create', () => {
    const createDto = {
      code: 'SP-001',
      name: 'Brake Pad',
      description: 'Front brake pad',
      category: 'brakes',
      unit: 'unit',
      currentStock: 10,
      minStock: 5,
      maxStock: 50,
      unitCost: 25.5,
      sellingPrice: 45.0,
      supplier: 'AutoParts Inc',
      notes: 'Test notes',
    };

    it('should create a spare part successfully', async () => {
      const mockTx = createMockTx();
      mockTx.sparePart.findFirst.mockResolvedValue(null);
      mockTx.sparePart.create.mockResolvedValue(mockSparePart);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.create(mockTenantId, createDto);

      expect(result).toEqual(mockSparePart);
    });

    it('should create a spare part with only required fields', async () => {
      const minimalDto = { code: 'SP-001', name: 'Brake Pad' };
      const minimalSparePart = {
        ...mockSparePart,
        description: null,
        category: null,
        unit: 'unit',
        currentStock: 0,
        minStock: 0,
        maxStock: 0,
        unitCost: null,
        sellingPrice: null,
        supplier: null,
        notes: null,
      };
      const mockTx = createMockTx();
      mockTx.sparePart.findFirst.mockResolvedValue(null);
      mockTx.sparePart.create.mockResolvedValue(minimalSparePart);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.create(mockTenantId, minimalDto);

      expect(result).toEqual(minimalSparePart);
    });

    it('should throw ConflictException if code already exists', async () => {
      const mockTx = createMockTx();
      mockTx.sparePart.findFirst.mockResolvedValue({ id: 'existing-part' });
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(service.create(mockTenantId, createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated spare parts', async () => {
      const query = { page: 1, limit: 10 };
      const mockTx = createMockTx();
      mockTx.sparePart.findMany.mockResolvedValue([mockSparePart]);
      mockTx.sparePart.count.mockResolvedValue(1);
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
      mockTx.sparePart.findMany.mockResolvedValue([]);
      mockTx.sparePart.count.mockResolvedValue(0);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await service.findAll(mockTenantId, query);

      expect(prisma.withRlsTransaction).toHaveBeenCalled();
    });

    it('should filter by category', async () => {
      const query = { category: 'brakes' };
      const mockTx = createMockTx();
      mockTx.sparePart.findMany.mockResolvedValue([]);
      mockTx.sparePart.count.mockResolvedValue(0);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await service.findAll(mockTenantId, query);

      expect(prisma.withRlsTransaction).toHaveBeenCalled();
    });

    it('should search in multiple fields', async () => {
      const query = { search: 'Brake' };
      const mockTx = createMockTx();
      mockTx.sparePart.findMany.mockResolvedValue([]);
      mockTx.sparePart.count.mockResolvedValue(0);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await service.findAll(mockTenantId, query);

      expect(prisma.withRlsTransaction).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a spare part by id', async () => {
      const mockTx = createMockTx();
      mockTx.sparePart.findFirst.mockResolvedValue(mockSparePart);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.findOne(mockTenantId, mockSparePartId);

      expect(result).toEqual(mockSparePart);
    });

    it('should throw NotFoundException if spare part does not exist', async () => {
      const mockTx = createMockTx();
      mockTx.sparePart.findFirst.mockResolvedValue(null);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.findOne(mockTenantId, mockSparePartId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto = {
      name: 'Updated Brake Pad',
      currentStock: 15,
    };

    it('should update a spare part successfully', async () => {
      const updatedSparePart = { ...mockSparePart, ...updateDto };
      const mockTx = createMockTx();
      mockTx.sparePart.findFirst.mockResolvedValue(mockSparePart);
      mockTx.sparePart.update.mockResolvedValue(updatedSparePart);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.update(
        mockTenantId,
        mockSparePartId,
        updateDto,
      );

      expect(result).toEqual(updatedSparePart);
    });

    it('should throw NotFoundException if spare part does not exist', async () => {
      const mockTx = createMockTx();
      mockTx.sparePart.findFirst.mockResolvedValue(null);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.update(mockTenantId, mockSparePartId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if new code already exists', async () => {
      const mockTx = createMockTx();
      mockTx.sparePart.findFirst
        .mockResolvedValueOnce(mockSparePart) // spare part exists
        .mockResolvedValueOnce({ id: 'other-part' }); // code exists
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.update(mockTenantId, mockSparePartId, { code: 'SP-999' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should soft delete a spare part', async () => {
      const inactiveSparePart = { ...mockSparePart, status: 'inactive' };
      const mockTx = createMockTx();
      mockTx.sparePart.findFirst.mockResolvedValue(mockSparePart);
      mockTx.sparePart.update.mockResolvedValue(inactiveSparePart);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.remove(mockTenantId, mockSparePartId);

      expect(result.status).toBe('inactive');
    });

    it('should throw NotFoundException if spare part does not exist', async () => {
      const mockTx = createMockTx();
      mockTx.sparePart.findFirst.mockResolvedValue(null);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.remove(mockTenantId, mockSparePartId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
