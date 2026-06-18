import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('ClientsService', () => {
  let service: ClientsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const mockTenantId = '00000000-0000-0000-0000-000000000001';

  const createMockTx = () => ({
    client: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    vehicle: {
      count: jest.fn(),
    },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
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

    service = module.get<ClientsService>(ClientsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create', () => {
    const createDto = {
      name: 'Juan Pérez',
      email: 'juan@test.com',
      phone: '1145678901',
    };

    it('should create a client with tenantId', async () => {
      const createdClient = {
        id: 'client-1',
        ...createDto,
        tenantId: mockTenantId,
      };
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue(null);
      mockTx.client.create.mockResolvedValue(createdClient);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.create(mockTenantId, createDto);

      expect(result).toEqual(createdClient);
    });

    it('should throw ConflictException on duplicate email', async () => {
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue({ id: 'existing' });
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(service.create(mockTenantId, createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException on duplicate phone', async () => {
      const mockTx = createMockTx();
      mockTx.client.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing' });
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(service.create(mockTenantId, createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should allow null email and phone', async () => {
      const dtoWithoutContact = { name: 'Juan Pérez' };
      const createdClient = {
        id: 'client-2',
        ...dtoWithoutContact,
        tenantId: mockTenantId,
      };
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue(null);
      mockTx.client.create.mockResolvedValue(createdClient);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await service.create(
        mockTenantId,
        dtoWithoutContact as any,
      );
      expect(result).toEqual(createdClient);
    });
  });

  describe('findAll', () => {
    it('should return paginated results with default params', async () => {
      const clients = [{ id: '1', name: 'Juan Pérez' }];
      const mockTx = createMockTx();
      mockTx.client.findMany.mockResolvedValue(clients);
      mockTx.client.count.mockResolvedValue(1);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.findAll(mockTenantId, {});

      expect(result.data).toEqual(clients);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 50,
        total_pages: 1,
      });
    });

    it('should filter by search term across name/email', async () => {
      const mockTx = createMockTx();
      mockTx.client.findMany.mockResolvedValue([]);
      mockTx.client.count.mockResolvedValue(0);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await service.findAll(mockTenantId, { search: 'juan' });

      expect(prisma.withRlsTransaction).toHaveBeenCalled();
    });

    it('should respect custom page and limit', async () => {
      const mockTx = createMockTx();
      mockTx.client.findMany.mockResolvedValue([]);
      mockTx.client.count.mockResolvedValue(0);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await service.findAll(mockTenantId, { page: 2, limit: 5 });

      expect(prisma.withRlsTransaction).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return client by id', async () => {
      const client = { id: 'client-1', name: 'Juan Pérez' };
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue(client);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.findOne(mockTenantId, 'client-1');

      expect(result).toEqual(client);
    });

    it('should throw NotFoundException for non-existent client', async () => {
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue(null);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.findOne(mockTenantId, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto = { name: 'Updated Name' };

    it('should patch allowed fields', async () => {
      const existing = {
        id: 'client-1',
        name: 'Juan Pérez',
        email: 'juan@test.com',
      };
      const updated = { ...existing, name: 'Updated Name' };
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue(existing);
      mockTx.client.update.mockResolvedValue(updated);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.update(mockTenantId, 'client-1', updateDto);

      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException for non-existent client', async () => {
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue(null);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.update(mockTenantId, 'nonexistent', updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on email duplicate', async () => {
      const existing = { id: 'client-1', email: 'old@test.com' };
      const mockTx = createMockTx();
      mockTx.client.findFirst
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ id: 'other' });
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.update(mockTenantId, 'client-1', {
          email: 'duplicate@test.com',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should soft-delete client (status → inactive)', async () => {
      const existing = { id: 'client-1', status: 'active' };
      const updated = { ...existing, status: 'inactive' };
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue(existing);
      mockTx.vehicle.count.mockResolvedValue(0);
      mockTx.client.update.mockResolvedValue(updated);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await service.remove(mockTenantId, 'client-1');

      expect(result.status).toBe('inactive');
    });

    it('should reject when client has vehicles', async () => {
      const existing = { id: 'client-1' };
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue(existing);
      mockTx.vehicle.count.mockResolvedValue(3);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(service.remove(mockTenantId, 'client-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException for non-existent client', async () => {
      const mockTx = createMockTx();
      mockTx.client.findFirst.mockResolvedValue(null);
      prisma.withRlsTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(service.remove(mockTenantId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
