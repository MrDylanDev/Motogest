import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, SparePart } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateSparePartDto } from './dto/create-spare-part.dto';
import { UpdateSparePartDto } from './dto/update-spare-part.dto';
import { QuerySparePartDto } from './dto/query-spare-part.dto';

@Injectable()
export class SparePartsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateSparePartDto): Promise<SparePart> {
    return this.prisma.withRlsTransaction(async (tx) => {
      // Verificar unicidad de code
      const existingCode = await tx.sparePart.findFirst({
        where: { code: dto.code, tenantId },
      });
      if (existingCode) {
        throw new ConflictException('Spare part with this code already exists');
      }

      return tx.sparePart.create({
        data: {
          tenantId,
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          category: dto.category ?? null,
          unit: dto.unit ?? 'unit',
          currentStock: dto.currentStock ?? 0,
          minStock: dto.minStock ?? 0,
          maxStock: dto.maxStock ?? 0,
          unitCost: dto.unitCost ?? null,
          sellingPrice: dto.sellingPrice ?? null,
          supplier: dto.supplier ?? null,
          notes: dto.notes ?? null,
        },
      });
    });
  }

  async findAll(
    tenantId: string,
    query: QuerySparePartDto,
  ): Promise<{
    data: SparePart[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const {
        search,
        status,
        category,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = query;

      const where: Prisma.SparePartWhereInput = { tenantId };

      // Filtros
      if (status) {
        where.status = status;
      }
      if (category) {
        where.category = { equals: category, mode: 'insensitive' };
      }

      // Búsqueda en múltiples campos
      if (search) {
        where.OR = [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { supplier: { contains: search, mode: 'insensitive' } },
        ];
      }

      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        tx.sparePart.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
        }),
        tx.sparePart.count({ where }),
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

  async findOne(tenantId: string, id: string): Promise<SparePart> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const sparePart = await tx.sparePart.findFirst({
        where: { id, tenantId },
      });

      if (!sparePart) {
        throw new NotFoundException('Spare part not found');
      }

      return sparePart;
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateSparePartDto,
  ): Promise<SparePart> {
    return this.prisma.withRlsTransaction(async (tx) => {
      // Verificar que el repuesto existe
      const sparePart = await tx.sparePart.findFirst({
        where: { id, tenantId },
      });
      if (!sparePart) {
        throw new NotFoundException('Spare part not found');
      }

      // Verificar unicidad de code si cambia
      if (dto.code && dto.code !== sparePart.code) {
        const existingCode = await tx.sparePart.findFirst({
          where: { code: dto.code, tenantId, id: { not: id } },
        });
        if (existingCode) {
          throw new ConflictException(
            'Spare part with this code already exists',
          );
        }
      }

      return tx.sparePart.update({
        where: { id },
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description,
          category: dto.category,
          unit: dto.unit,
          currentStock: dto.currentStock,
          minStock: dto.minStock,
          maxStock: dto.maxStock,
          unitCost: dto.unitCost,
          sellingPrice: dto.sellingPrice,
          supplier: dto.supplier,
          notes: dto.notes,
          status: dto.status,
        },
      });
    });
  }

  async remove(tenantId: string, id: string): Promise<SparePart> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const sparePart = await tx.sparePart.findFirst({
        where: { id, tenantId },
      });
      if (!sparePart) {
        throw new NotFoundException('Spare part not found');
      }

      // Soft delete: cambiar status a 'inactive'
      return tx.sparePart.update({
        where: { id },
        data: { status: 'inactive' },
      });
    });
  }
}
