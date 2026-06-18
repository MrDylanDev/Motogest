import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WorkOrderCost } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CostService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(
    tenantId: string,
    workOrderId: string,
  ): Promise<WorkOrderCost> {
    return this.prisma.withRlsTransaction(async (tx) => {
      // Obtener OT con mecánicos y repuestos consumidos
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
        include: {
          mechanics: {
            include: {
              mechanic: true,
            },
          },
          spareParts: {
            where: { status: 'consumed' },
          },
        },
      });

      if (!workOrder) {
        throw new NotFoundException('Work order not found');
      }

      // Calcular labor cost
      let laborCost = new Prisma.Decimal(0);
      if (workOrder.startedAt && workOrder.completedAt) {
        const hours =
          (workOrder.completedAt.getTime() - workOrder.startedAt.getTime()) /
          3600000;
        if (hours > 0) {
          for (const wm of workOrder.mechanics) {
            if (wm.mechanic.hourlyRate) {
              laborCost = laborCost.add(
                new Prisma.Decimal(hours).mul(wm.mechanic.hourlyRate),
              );
            }
          }
        }
      }

      // Calcular parts cost
      let partsCost = new Prisma.Decimal(0);
      for (const sp of workOrder.spareParts) {
        partsCost = partsCost.add(sp.totalPrice);
      }

      const subtotal = laborCost.add(partsCost);
      const taxRate = new Prisma.Decimal(0.21);
      const taxAmount = subtotal.mul(taxRate);
      const discountPercent = new Prisma.Decimal(0);
      const discountAmount = subtotal.mul(discountPercent.div(100));
      const total = subtotal.add(taxAmount).sub(discountAmount);

      // Upsert WorkOrderCost
      return tx.workOrderCost.upsert({
        where: { workOrderId },
        create: {
          workOrderId,
          laborCost,
          partsCost,
          subtotal,
          taxRate,
          taxAmount,
          discountPercent,
          discountAmount,
          total,
          calculatedAt: new Date(),
        },
        update: {
          laborCost,
          partsCost,
          subtotal,
          taxRate,
          taxAmount,
          discountPercent,
          discountAmount,
          total,
          calculatedAt: new Date(),
        },
      });
    });
  }

  async getCosts(
    tenantId: string,
    workOrderId: string,
  ): Promise<WorkOrderCost> {
    return this.prisma.withRlsTransaction(async (tx) => {
      // Validar OT existe
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
      });
      if (!workOrder) {
        throw new NotFoundException('Work order not found');
      }

      const costs = await tx.workOrderCost.findFirst({
        where: { workOrderId },
      });

      if (!costs) {
        throw new NotFoundException('Costs not calculated yet');
      }

      return costs;
    });
  }
}
