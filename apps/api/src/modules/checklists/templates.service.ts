import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, ChecklistTemplate } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { QueryTemplateDto } from './dto/query-template.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    dto: CreateTemplateDto,
  ): Promise<ChecklistTemplate> {
    return this.prisma.withRlsTransaction(async (tx) => {
      // Validate unique name
      const existing = await tx.checklistTemplate.findFirst({
        where: { name: dto.name, tenantId },
      });
      if (existing) {
        throw new ConflictException('Template name already exists');
      }

      // Create template with nested data
      return tx.checklistTemplate.create({
        data: {
          tenantId,
          name: dto.name,
          description: dto.description,
          sections: {
            create: dto.sections.map((section) => ({
              tenantId,
              name: section.name,
              order: section.order,
              isRequired: section.isRequired ?? true,
              questions: {
                create: section.questions.map((question) => ({
                  tenantId,
                  text: question.text,
                  type: question.type,
                  options: question.options,
                  isRequired: question.isRequired ?? true,
                  order: question.order,
                  weight: question.weight ?? 1,
                })),
              },
            })),
          },
        },
        include: {
          sections: {
            include: {
              questions: true,
            },
          },
        },
      });
    });
  }

  async findAll(
    tenantId: string,
    query: QueryTemplateDto,
  ): Promise<{
    data: ChecklistTemplate[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const { search, isActive, page = 1, limit = 50 } = query;

      const where: Prisma.ChecklistTemplateWhereInput = { tenantId };

      if (search) {
        where.name = { contains: search, mode: 'insensitive' };
      }

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        tx.checklistTemplate.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            sections: {
              include: {
                questions: true,
              },
            },
          },
        }),
        tx.checklistTemplate.count({ where }),
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

  async findOne(tenantId: string, id: string): Promise<ChecklistTemplate> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const template = await tx.checklistTemplate.findFirst({
        where: { id, tenantId },
        include: {
          sections: {
            include: {
              questions: true,
            },
          },
        },
      });

      if (!template) {
        throw new NotFoundException('Template not found');
      }

      return template;
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTemplateDto,
  ): Promise<ChecklistTemplate> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const template = await tx.checklistTemplate.findFirst({
        where: { id, tenantId },
        include: {
          executions: {
            take: 1,
          },
        },
      });

      if (!template) {
        throw new NotFoundException('Template not found');
      }

      // Cannot update if template has executions
      if (template.executions.length > 0) {
        throw new BadRequestException(
          'Cannot update template with existing executions',
        );
      }

      // Validate unique name if changing
      if (dto.name && dto.name !== template.name) {
        const existing = await tx.checklistTemplate.findFirst({
          where: { name: dto.name, tenantId, id: { not: id } },
        });
        if (existing) {
          throw new ConflictException('Template name already exists');
        }
      }

      // If sections are provided, delete old ones and create new
      if (dto.sections) {
        await tx.checklistSection.deleteMany({
          where: { templateId: id },
        });

        return tx.checklistTemplate.update({
          where: { id },
          data: {
            name: dto.name,
            description: dto.description,
            sections: {
              create: dto.sections.map((section) => ({
                tenantId,
                name: section.name,
                order: section.order,
                isRequired: section.isRequired ?? true,
                questions: {
                  create: section.questions.map((question) => ({
                    tenantId,
                    text: question.text,
                    type: question.type,
                    options: question.options,
                    isRequired: question.isRequired ?? true,
                    order: question.order,
                    weight: question.weight ?? 1,
                  })),
                },
              })),
            },
          },
          include: {
            sections: {
              include: {
                questions: true,
              },
            },
          },
        });
      }

      return tx.checklistTemplate.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
        },
        include: {
          sections: {
            include: {
              questions: true,
            },
          },
        },
      });
    });
  }

  async remove(tenantId: string, id: string): Promise<ChecklistTemplate> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const template = await tx.checklistTemplate.findFirst({
        where: { id, tenantId },
      });

      if (!template) {
        throw new NotFoundException('Template not found');
      }

      // Soft delete
      return tx.checklistTemplate.update({
        where: { id },
        data: { isActive: false },
        include: {
          sections: {
            include: {
              questions: true,
            },
          },
        },
      });
    });
  }
}
