import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientDto } from './dto/query-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateClientDto) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      if (dto.email) {
        const existing = await txClient.client.findFirst({
          where: { tenantId, email: dto.email },
        });
        if (existing) {
          throw new ConflictException('EMAIL_ALREADY_EXISTS');
        }
      }
      if (dto.phone) {
        const existing = await txClient.client.findFirst({
          where: { tenantId, phone: dto.phone },
        });
        if (existing) {
          throw new ConflictException('PHONE_ALREADY_EXISTS');
        }
      }

      return txClient.client.create({
        data: {
          tenantId,
          name: dto.name,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          address: dto.address ?? null,
        },
      });
    });
  }

  async findAll(tenantId: string, query: QueryClientDto) {
    const {
      search,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = ['name', 'email', 'createdAt'];
    const orderByField = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'createdAt';

    return this.prisma.withRlsTransaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const data = await txClient.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderByField]: sortOrder },
      });
      const total = await txClient.client.count({ where });

      return {
        data,
        meta: {
          total,
          page,
          limit,
          total_pages: Math.ceil(total / limit),
        },
      };
    });
  }

  async findOne(tenantId: string, id: string) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const client = await txClient.client.findFirst({
        where: { tenantId, id },
      });
      if (!client) {
        throw new NotFoundException('CLIENT_NOT_FOUND');
      }
      return client;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateClientDto) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const existing = await txClient.client.findFirst({
        where: { tenantId, id },
      });
      if (!existing) {
        throw new NotFoundException('CLIENT_NOT_FOUND');
      }

      if (dto.email && dto.email !== existing.email) {
        const duplicate = await txClient.client.findFirst({
          where: { tenantId, email: dto.email },
        });
        if (duplicate) {
          throw new ConflictException('EMAIL_ALREADY_EXISTS');
        }
      }

      if (dto.phone && dto.phone !== existing.phone) {
        const duplicate = await txClient.client.findFirst({
          where: { tenantId, phone: dto.phone },
        });
        if (duplicate) {
          throw new ConflictException('PHONE_ALREADY_EXISTS');
        }
      }

      return txClient.client.update({
        where: { id, tenantId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.address !== undefined && { address: dto.address }),
        },
      });
    });
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const existing = await txClient.client.findFirst({
        where: { tenantId, id },
      });
      if (!existing) {
        throw new NotFoundException('CLIENT_NOT_FOUND');
      }

      const vehicleCount = await txClient.vehicle.count({
        where: { clientId: id, tenantId },
      });
      if (vehicleCount > 0) {
        throw new ConflictException('CLIENT_HAS_VEHICLES');
      }

      return txClient.client.update({
        where: { id, tenantId },
        data: { status: 'inactive' },
      });
    });
  }
}
