import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, Mechanic } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateMechanicDto } from './dto/create-mechanic.dto';
import { UpdateMechanicDto } from './dto/update-mechanic.dto';
import { QueryMechanicDto } from './dto/query-mechanic.dto';

@Injectable()
export class MechanicsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateMechanicDto): Promise<Mechanic> {
    return this.prisma.withRlsTransaction(async (tx) => {
      // Verificar unicidad de email si se proporciona
      if (dto.email) {
        const existingEmail = await tx.mechanic.findFirst({
          where: { email: dto.email, tenantId },
        });
        if (existingEmail) {
          throw new ConflictException(
            'Mechanic with this email already exists',
          );
        }
      }

      // Verificar unicidad de phone si se proporciona
      if (dto.phone) {
        const existingPhone = await tx.mechanic.findFirst({
          where: { phone: dto.phone, tenantId },
        });
        if (existingPhone) {
          throw new ConflictException(
            'Mechanic with this phone already exists',
          );
        }
      }

      return tx.mechanic.create({
        data: {
          tenantId,
          name: dto.name,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          specializations: dto.specializations ?? [],
          hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
          notes: dto.notes ?? null,
        },
      });
    });
  }

  async findAll(
    tenantId: string,
    query: QueryMechanicDto,
  ): Promise<{
    data: Mechanic[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const {
        search,
        status,
        specialization,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = query;

      const where: Prisma.MechanicWhereInput = { tenantId };

      // Filtros
      if (status) {
        where.status = status;
      }
      if (specialization) {
        where.specializations = { has: specialization };
      }

      // Búsqueda en múltiples campos
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ];
      }

      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        tx.mechanic.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
        }),
        tx.mechanic.count({ where }),
      ]);

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    });
  }

  async findOne(tenantId: string, id: string): Promise<Mechanic> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const mechanic = await tx.mechanic.findFirst({
        where: { id, tenantId },
      });

      if (!mechanic) {
        throw new NotFoundException('Mechanic not found');
      }

      return mechanic;
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateMechanicDto,
  ): Promise<Mechanic> {
    return this.prisma.withRlsTransaction(async (tx) => {
      // Verificar que el mecánico existe
      const mechanic = await tx.mechanic.findFirst({
        where: { id, tenantId },
      });
      if (!mechanic) {
        throw new NotFoundException('Mechanic not found');
      }

      // Verificar unicidad de email si cambia
      if (dto.email && dto.email !== mechanic.email) {
        const existingEmail = await tx.mechanic.findFirst({
          where: { email: dto.email, tenantId, id: { not: id } },
        });
        if (existingEmail) {
          throw new ConflictException(
            'Mechanic with this email already exists',
          );
        }
      }

      // Verificar unicidad de phone si cambia
      if (dto.phone && dto.phone !== mechanic.phone) {
        const existingPhone = await tx.mechanic.findFirst({
          where: { phone: dto.phone, tenantId, id: { not: id } },
        });
        if (existingPhone) {
          throw new ConflictException(
            'Mechanic with this phone already exists',
          );
        }
      }

      return tx.mechanic.update({
        where: { id },
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          specializations: dto.specializations,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : dto.hireDate,
          notes: dto.notes,
          status: dto.status,
        },
      });
    });
  }

  async remove(tenantId: string, id: string): Promise<Mechanic> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const mechanic = await tx.mechanic.findFirst({
        where: { id, tenantId },
      });
      if (!mechanic) {
        throw new NotFoundException('Mechanic not found');
      }

      // Soft delete: cambiar status a 'inactive'
      return tx.mechanic.update({
        where: { id },
        data: { status: 'inactive' },
      });
    });
  }
}
