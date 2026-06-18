import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, Vehicle } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { QueryVehicleDto } from './dto/query-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    dto: CreateVehicleDto,
  ): Promise<
    Vehicle & {
      client: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
      };
    }
  > {
    return this.prisma.withRlsTransaction(async (tx) => {
      // Verificar que el cliente existe y pertenece al tenant
      const client = await tx.client.findFirst({
        where: { id: dto.clientId, tenantId },
      });
      if (!client) {
        throw new NotFoundException('Client not found');
      }

      // Verificar unicidad de plate
      const existingPlate = await tx.vehicle.findFirst({
        where: { plate: dto.plate, tenantId },
      });
      if (existingPlate) {
        throw new ConflictException('Vehicle with this plate already exists');
      }

      // Verificar unicidad de VIN si se proporciona
      if (dto.vin) {
        const existingVin = await tx.vehicle.findFirst({
          where: { vin: dto.vin, tenantId },
        });
        if (existingVin) {
          throw new ConflictException('Vehicle with this VIN already exists');
        }
      }

      return tx.vehicle.create({
        data: {
          tenantId,
          clientId: dto.clientId,
          make: dto.make,
          model: dto.model,
          year: dto.year,
          plate: dto.plate,
          vin: dto.vin,
          color: dto.color,
          fuelType: dto.fuelType,
          mileage: dto.mileage ?? 0,
          notes: dto.notes,
        },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      });
    });
  }

  async findAll(
    tenantId: string,
    query: QueryVehicleDto,
  ): Promise<{
    data: Array<
      Vehicle & {
        client: {
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
        };
      }
    >;
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const {
        search,
        clientId,
        make,
        fuelType,
        status,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = query;

      const where: Prisma.VehicleWhereInput = { tenantId };

      // Filtros
      if (clientId) {
        where.clientId = clientId;
      }
      if (make) {
        where.make = { contains: make, mode: 'insensitive' };
      }
      if (fuelType) {
        where.fuelType = { equals: fuelType, mode: 'insensitive' };
      }
      if (status) {
        where.status = status;
      }

      // Búsqueda en múltiples campos
      if (search) {
        where.OR = [
          { plate: { contains: search, mode: 'insensitive' } },
          { vin: { contains: search, mode: 'insensitive' } },
          { make: { contains: search, mode: 'insensitive' } },
          { model: { contains: search, mode: 'insensitive' } },
        ];
      }

      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        tx.vehicle.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            client: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        }),
        tx.vehicle.count({ where }),
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

  async findOne(
    tenantId: string,
    id: string,
  ): Promise<
    Vehicle & {
      client: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
      };
    }
  > {
    return this.prisma.withRlsTransaction(async (tx) => {
      const vehicle = await tx.vehicle.findFirst({
        where: { id, tenantId },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      if (!vehicle) {
        throw new NotFoundException('Vehicle not found');
      }

      return vehicle;
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateVehicleDto,
  ): Promise<
    Vehicle & {
      client: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
      };
    }
  > {
    return this.prisma.withRlsTransaction(async (tx) => {
      // Verificar que el vehículo existe
      const vehicle = await tx.vehicle.findFirst({
        where: { id, tenantId },
      });
      if (!vehicle) {
        throw new NotFoundException('Vehicle not found');
      }

      // Si cambia clientId, verificar que el nuevo cliente existe
      if (dto.clientId && dto.clientId !== vehicle.clientId) {
        const client = await tx.client.findFirst({
          where: { id: dto.clientId, tenantId },
        });
        if (!client) {
          throw new NotFoundException('Client not found');
        }
      }

      // Verificar unicidad de plate si cambia
      if (dto.plate && dto.plate !== vehicle.plate) {
        const existingPlate = await tx.vehicle.findFirst({
          where: { plate: dto.plate, tenantId, id: { not: id } },
        });
        if (existingPlate) {
          throw new ConflictException('Vehicle with this plate already exists');
        }
      }

      // Verificar unicidad de VIN si cambia
      if (dto.vin && dto.vin !== vehicle.vin) {
        const existingVin = await tx.vehicle.findFirst({
          where: { vin: dto.vin, tenantId, id: { not: id } },
        });
        if (existingVin) {
          throw new ConflictException('Vehicle with this VIN already exists');
        }
      }

      return tx.vehicle.update({
        where: { id },
        data: {
          clientId: dto.clientId,
          make: dto.make,
          model: dto.model,
          year: dto.year,
          plate: dto.plate,
          vin: dto.vin,
          color: dto.color,
          fuelType: dto.fuelType,
          mileage: dto.mileage,
          notes: dto.notes,
          status: dto.status,
        },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      });
    });
  }

  async remove(
    tenantId: string,
    id: string,
  ): Promise<
    Vehicle & {
      client: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
      };
    }
  > {
    return this.prisma.withRlsTransaction(async (tx) => {
      const vehicle = await tx.vehicle.findFirst({
        where: { id, tenantId },
      });
      if (!vehicle) {
        throw new NotFoundException('Vehicle not found');
      }

      // Soft delete: cambiar status a 'inactive'
      return tx.vehicle.update({
        where: { id },
        data: { status: 'inactive' },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      });
    });
  }
}
