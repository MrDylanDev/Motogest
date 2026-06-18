import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkOrderSparePart } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isFinalMilestone } from './constants/work-order-milestones';

@Injectable()
export class PartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async addPart(
    tenantId: string,
    workOrderId: string,
    sparePartId: string,
    quantity: number,
  ): Promise<WorkOrderSparePart> {
    return this.prisma.withRlsTransaction(async (tx) => {
      // 1. Validar OT existe y no está en estado final
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
      });
      if (!workOrder) {
        throw new NotFoundException('Work order not found');
      }
      if (isFinalMilestone(workOrder.milestone)) {
        throw new BadRequestException(
          'Cannot add parts to completed/cancelled work order',
        );
      }

      // 2. Validar SparePart existe
      const sparePart = await tx.sparePart.findFirst({
        where: { id: sparePartId, tenantId },
      });
      if (!sparePart) {
        throw new NotFoundException('Spare part not found');
      }

      // 3. Validar stock disponible
      if (sparePart.currentStock < quantity) {
        throw new BadRequestException('Insufficient stock');
      }

      // 4. Crear WorkOrderSparePart
      const unitPrice = sparePart.sellingPrice;
      if (!unitPrice) {
        throw new BadRequestException('Spare part has no selling price');
      }
      const totalPrice = unitPrice.mul(quantity);
      const workOrderSparePart = await tx.workOrderSparePart.create({
        data: {
          tenantId,
          workOrderId,
          sparePartId,
          quantity,
          unitPrice,
          totalPrice,
          status: 'reserved',
        },
      });

      // 5. Decrementar stock (dentro de la misma transacción)
      await tx.sparePart.update({
        where: { id: sparePartId },
        data: { currentStock: { decrement: quantity } },
      });

      // 6. Emitir evento si stock bajo
      if (sparePart.currentStock - quantity < sparePart.minStock) {
        this.eventEmitter.emit('inventory.stock.low', {
          tenantId,
          sparePartId,
          sparePartName: sparePart.name,
          currentStock: sparePart.currentStock - quantity,
        });
      }

      return workOrderSparePart;
    });
  }

  async removePart(
    tenantId: string,
    workOrderId: string,
    partId: string,
  ): Promise<WorkOrderSparePart> {
    return this.prisma.withRlsTransaction(async (tx) => {
      // 1. Validar WorkOrderSparePart existe
      const workOrderSparePart = await tx.workOrderSparePart.findFirst({
        where: { id: partId, workOrderId, tenantId },
      });
      if (!workOrderSparePart) {
        throw new NotFoundException('Work order spare part not found');
      }

      // 2. Validar status='reserved'
      if (workOrderSparePart.status !== 'reserved') {
        throw new BadRequestException(
          'Cannot remove consumed or returned spare part',
        );
      }

      // 3. Cambiar status a 'returned'
      const updated = await tx.workOrderSparePart.update({
        where: { id: partId },
        data: {
          status: 'returned',
          returnedAt: new Date(),
        },
      });

      // 4. Devolver stock (dentro de la misma transacción)
      await tx.sparePart.update({
        where: { id: workOrderSparePart.sparePartId },
        data: { currentStock: { increment: workOrderSparePart.quantity } },
      });

      return updated;
    });
  }

  async listParts(
    tenantId: string,
    workOrderId: string,
  ): Promise<WorkOrderSparePart[]> {
    return this.prisma.withRlsTransaction(async (tx) => {
      // Validar OT existe
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
      });
      if (!workOrder) {
        throw new NotFoundException('Work order not found');
      }

      return tx.workOrderSparePart.findMany({
        where: { workOrderId, tenantId },
        include: {
          sparePart: {
            select: {
              id: true,
              name: true,
              code: true,
              category: true,
            },
          },
        },
      });
    });
  }

  async consumeAllReserved(
    tenantId: string,
    workOrderId: string,
  ): Promise<void> {
    return this.prisma.withRlsTransaction(async (tx) => {
      await tx.workOrderSparePart.updateMany({
        where: { workOrderId, tenantId, status: 'reserved' },
        data: {
          status: 'consumed',
          consumedAt: new Date(),
        },
      });
    });
  }

  async returnAllReserved(
    tenantId: string,
    workOrderId: string,
  ): Promise<void> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const reservedParts = await tx.workOrderSparePart.findMany({
        where: { workOrderId, tenantId, status: 'reserved' },
      });

      if (reservedParts.length === 0) {
        return;
      }

      // Actualizar status de todos los repuestos reservados
      await tx.workOrderSparePart.updateMany({
        where: { workOrderId, tenantId, status: 'reserved' },
        data: {
          status: 'returned',
          returnedAt: new Date(),
        },
      });

      // Devolver stock para cada repuesto
      for (const part of reservedParts) {
        await tx.sparePart.update({
          where: { id: part.sparePartId },
          data: { currentStock: { increment: part.quantity } },
        });
      }
    });
  }
}
