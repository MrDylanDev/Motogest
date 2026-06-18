import {
  Injectable,
  NotFoundException,
  BadRequestException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { QueryWorkOrderDto } from './dto/query-work-order.dto';
import { AssignMechanicsDto } from './dto/assign-mechanics.dto';
import { TransitionMilestoneDto } from './dto/transition-milestone.dto';
import {
  WORK_ORDER_MILESTONES,
  isValidTransition,
  isFinalMilestone,
} from './constants/work-order-milestones';
import { ExecutionsService } from '../checklists/executions.service';

@Injectable()
export class WorkOrdersService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => ExecutionsService))
    private executionsService: ExecutionsService,
  ) {}

  async create(tenantId: string, dto: CreateWorkOrderDto) {
    return this.prisma.withRlsTransaction(async (tx) => {
      // Validar vehicle existe y pertenece al tenant
      const vehicle = await tx.vehicle.findFirst({
        where: { id: dto.vehicleId, tenantId },
      });
      if (!vehicle) {
        throw new NotFoundException('Vehicle not found');
      }

      // Validar client existe y pertenece al tenant
      const client = await tx.client.findFirst({
        where: { id: dto.clientId, tenantId },
      });
      if (!client) {
        throw new NotFoundException('Client not found');
      }

      // Validar vehicle.clientId === clientId
      if (vehicle.clientId !== dto.clientId) {
        throw new BadRequestException(
          'Vehicle does not belong to the specified client',
        );
      }

      return tx.workOrder.create({
        data: {
          tenantId,
          vehicleId: dto.vehicleId,
          clientId: dto.clientId,
          description: dto.description,
          priority: dto.priority || 'normal',
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          clientNotes: dto.clientNotes,
          internalNotes: dto.internalNotes,
          milestone: WORK_ORDER_MILESTONES.CREATED,
        },
        include: {
          vehicle: true,
          client: true,
          mechanics: {
            include: {
              mechanic: true,
            },
          },
        },
      });
    });
  }

  async findAll(tenantId: string, query: QueryWorkOrderDto) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const {
        search,
        milestone,
        priority,
        vehicleId,
        clientId,
        mechanicId,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = query;

      const where: Prisma.WorkOrderWhereInput = {
        tenantId,
      };

      if (search) {
        where.OR = [
          { description: { contains: search, mode: 'insensitive' } },
          { client: { name: { contains: search, mode: 'insensitive' } } },
          { vehicle: { plate: { contains: search, mode: 'insensitive' } } },
        ];
      }

      if (milestone) {
        where.milestone = milestone;
      }

      if (priority) {
        where.priority = priority;
      }

      if (vehicleId) {
        where.vehicleId = vehicleId;
      }

      if (clientId) {
        where.clientId = clientId;
      }

      if (mechanicId) {
        where.mechanics = {
          some: {
            mechanicId,
          },
        };
      }

      const [data, total] = await Promise.all([
        tx.workOrder.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                plate: true,
              },
            },
            client: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            mechanics: {
              include: {
                mechanic: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        }),
        tx.workOrder.count({ where }),
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

  async findOne(tenantId: string, id: string) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const workOrder = await tx.workOrder.findFirst({
        where: { id, tenantId },
        include: {
          vehicle: true,
          client: true,
          mechanics: {
            include: {
              mechanic: true,
            },
          },
        },
      });

      if (!workOrder) {
        throw new NotFoundException('Work order not found');
      }

      return workOrder;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateWorkOrderDto) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const workOrder = await tx.workOrder.findFirst({
        where: { id, tenantId },
      });

      if (!workOrder) {
        throw new NotFoundException('Work order not found');
      }

      if (workOrder.milestone === WORK_ORDER_MILESTONES.CANCELLED) {
        throw new BadRequestException('Cannot update a cancelled work order');
      }

      return tx.workOrder.update({
        where: { id },
        data: {
          description: dto.description,
          priority: dto.priority,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          clientNotes: dto.clientNotes,
          internalNotes: dto.internalNotes,
        },
        include: {
          vehicle: true,
          client: true,
          mechanics: {
            include: {
              mechanic: true,
            },
          },
        },
      });
    });
  }

  async cancel(tenantId: string, id: string) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const workOrder = await tx.workOrder.findFirst({
        where: { id, tenantId },
      });

      if (!workOrder) {
        throw new NotFoundException('Work order not found');
      }

      if (workOrder.milestone === WORK_ORDER_MILESTONES.CANCELLED) {
        throw new BadRequestException('Work order is already cancelled');
      }

      if (
        !isValidTransition(workOrder.milestone, WORK_ORDER_MILESTONES.CANCELLED)
      ) {
        throw new BadRequestException(
          `Cannot transition from ${workOrder.milestone} to cancelled`,
        );
      }

      return tx.workOrder.update({
        where: { id },
        data: {
          milestone: WORK_ORDER_MILESTONES.CANCELLED,
        },
        include: {
          vehicle: true,
          client: true,
          mechanics: {
            include: {
              mechanic: true,
            },
          },
        },
      });
    });
  }

  async assignMechanics(
    tenantId: string,
    workOrderId: string,
    dto: AssignMechanicsDto,
  ) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
        include: {
          mechanics: true,
        },
      });

      if (!workOrder) {
        throw new NotFoundException('Work order not found');
      }

      if (isFinalMilestone(workOrder.milestone)) {
        throw new BadRequestException(
          'Cannot assign mechanics to a completed or cancelled work order',
        );
      }

      // Validar primaryMechanicId está en mechanicIds
      if (
        dto.primaryMechanicId &&
        !dto.mechanicIds.includes(dto.primaryMechanicId)
      ) {
        throw new BadRequestException(
          'Primary mechanic must be in the list of mechanics',
        );
      }

      // Validar todos los mechanicIds existen y pertenecen al tenant
      const mechanics = await tx.mechanic.findMany({
        where: {
          id: { in: dto.mechanicIds },
          tenantId,
        },
      });

      if (mechanics.length !== dto.mechanicIds.length) {
        throw new NotFoundException('One or more mechanics not found');
      }

      // Eliminar asignaciones existentes
      await tx.workOrderMechanic.deleteMany({
        where: { workOrderId },
      });

      // Crear nuevas asignaciones
      await tx.workOrderMechanic.createMany({
        data: dto.mechanicIds.map((mechanicId) => ({
          tenantId,
          workOrderId,
          mechanicId,
          isPrimary: mechanicId === dto.primaryMechanicId,
        })),
      });

      // Auto-transition: created → assigned
      let newMilestone = workOrder.milestone;
      if (workOrder.milestone === WORK_ORDER_MILESTONES.CREATED) {
        newMilestone = WORK_ORDER_MILESTONES.ASSIGNED;
      }

      return tx.workOrder.update({
        where: { id: workOrderId },
        data: {
          milestone: newMilestone,
        },
        include: {
          vehicle: true,
          client: true,
          mechanics: {
            include: {
              mechanic: true,
            },
          },
        },
      });
    });
  }

  async unassignMechanic(
    tenantId: string,
    workOrderId: string,
    mechanicId: string,
  ) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
      });

      if (!workOrder) {
        throw new NotFoundException('Work order not found');
      }

      if (isFinalMilestone(workOrder.milestone)) {
        throw new BadRequestException(
          'Cannot unassign mechanics from a completed or cancelled work order',
        );
      }

      const workOrderMechanic = await tx.workOrderMechanic.findFirst({
        where: { workOrderId, mechanicId },
      });

      if (!workOrderMechanic) {
        throw new NotFoundException(
          'Mechanic is not assigned to this work order',
        );
      }

      await tx.workOrderMechanic.delete({
        where: { id: workOrderMechanic.id },
      });

      // Contar mecánicos restantes
      const remainingMechanics = await tx.workOrderMechanic.count({
        where: { workOrderId },
      });

      // Auto-transition: assigned → created si no quedan mecánicos
      let newMilestone = workOrder.milestone;
      if (
        remainingMechanics === 0 &&
        workOrder.milestone === WORK_ORDER_MILESTONES.ASSIGNED
      ) {
        newMilestone = WORK_ORDER_MILESTONES.CREATED;
      }

      return tx.workOrder.update({
        where: { id: workOrderId },
        data: {
          milestone: newMilestone,
        },
        include: {
          vehicle: true,
          client: true,
          mechanics: {
            include: {
              mechanic: true,
            },
          },
        },
      });
    });
  }

  async transitionMilestone(
    tenantId: string,
    workOrderId: string,
    dto: TransitionMilestoneDto,
  ) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
      });

      if (!workOrder) {
        throw new NotFoundException('Work order not found');
      }

      if (!isValidTransition(workOrder.milestone, dto.milestone)) {
        throw new BadRequestException(
          `Invalid transition from ${workOrder.milestone} to ${dto.milestone}`,
        );
      }

      // Validate checklists if transitioning to completed
      if (dto.milestone === WORK_ORDER_MILESTONES.COMPLETED) {
        await this.executionsService.validateChecklistsForCompletion(
          tenantId,
          workOrderId,
        );
      }

      const updateData: Prisma.WorkOrderUpdateInput = {
        milestone: dto.milestone,
      };

      // Side effects
      if (dto.milestone === WORK_ORDER_MILESTONES.IN_PROGRESS) {
        updateData.startedAt = new Date();
      }

      if (dto.milestone === WORK_ORDER_MILESTONES.COMPLETED) {
        updateData.completedAt = new Date();
      }

      return tx.workOrder.update({
        where: { id: workOrderId },
        data: updateData,
        include: {
          vehicle: true,
          client: true,
          mechanics: {
            include: {
              mechanic: true,
            },
          },
        },
      });
    });
  }

  async findAssignedToMechanic(
    tenantId: string,
    mechanicId: string,
    query: QueryWorkOrderDto,
  ) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const {
        search,
        milestone,
        priority,
        vehicleId,
        clientId,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = query;

      const where: Prisma.WorkOrderWhereInput = {
        tenantId,
        mechanics: {
          some: {
            mechanicId,
          },
        },
      };

      if (search) {
        where.OR = [
          { description: { contains: search, mode: 'insensitive' } },
          { client: { name: { contains: search, mode: 'insensitive' } } },
          { vehicle: { plate: { contains: search, mode: 'insensitive' } } },
        ];
      }

      if (milestone) {
        where.milestone = milestone;
      }

      if (priority) {
        where.priority = priority;
      }

      if (vehicleId) {
        where.vehicleId = vehicleId;
      }

      if (clientId) {
        where.clientId = clientId;
      }

      const [data, total] = await Promise.all([
        tx.workOrder.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                plate: true,
              },
            },
            client: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            mechanics: {
              include: {
                mechanic: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        }),
        tx.workOrder.count({ where }),
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
}
