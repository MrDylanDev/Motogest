import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardMetrics(): Promise<{
    totalClients: number;
    totalVehicles: number;
    totalMechanics: number;
    workOrdersByStatus: Record<string, number>;
    monthlyRevenue: number;
    pendingRevenue: number;
    lowStockParts: number;
  }> {
    return this.prisma.withRlsTransaction(async () => {
      const scoped = this.prisma.scoped();

      // Total de clientes activos
      const totalClients = await scoped.client.count({
        where: { status: 'active' },
      });

      // Total de vehículos
      const totalVehicles = await scoped.vehicle.count();

      // Total de mecánicos activos
      const totalMechanics = await scoped.mechanic.count({
        where: { status: 'active' },
      });

      // OTs por estado
      const workOrdersByStatus = await scoped.workOrder.groupBy({
        by: ['milestone'],
        _count: true,
      });

      // Ingresos del mes actual
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyRevenue = await scoped.invoice.aggregate({
        where: {
          issueDate: { gte: startOfMonth },
          status: { not: 'cancelled' },
        },
        _sum: {
          totalAmount: true,
        },
      });

      // Facturas pendientes de cobro
      const pendingInvoices = await scoped.invoice.aggregate({
        where: {
          status: { in: ['pending', 'partial'] },
        },
        _sum: {
          totalAmount: true,
        },
      });

      // Stock bajo (repuestos con stock actual <= stock mínimo)
      const allParts = await scoped.sparePart.findMany({
        where: { status: 'active' },
        select: { currentStock: true, minStock: true },
      });

      const lowStockParts = allParts.filter(
        (part) => part.currentStock <= part.minStock,
      ).length;

      return {
        totalClients,
        totalVehicles,
        totalMechanics,
        workOrdersByStatus: workOrdersByStatus.reduce(
          (acc: Record<string, number>, item) => {
            acc[item.milestone] = item._count;
            return acc;
          },
          {},
        ),
        monthlyRevenue: monthlyRevenue._sum.totalAmount?.toNumber() || 0,
        pendingRevenue: pendingInvoices._sum.totalAmount?.toNumber() || 0,
        lowStockParts,
      };
    });
  }

  async getRevenueReport(
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      issueDate: Date;
      totalAmount: Prisma.Decimal;
      paidAmount: Prisma.Decimal;
      status: string;
      client: { name: string };
    }>;
    totalRevenue: number;
    totalPaid: number;
    totalPending: number;
  }> {
    return this.prisma.withRlsTransaction(async () => {
      const scoped = this.prisma.scoped();
      const where: Prisma.InvoiceWhereInput = {
        status: { not: 'cancelled' },
      };

      if (startDate || endDate) {
        where.issueDate = {};
        if (startDate) where.issueDate.gte = startDate;
        if (endDate) where.issueDate.lte = endDate;
      }

      const invoices = await scoped.invoice.findMany({
        where,
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
          client: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { issueDate: 'desc' },
      });

      const totalRevenue = invoices.reduce(
        (sum: number, inv) => sum + inv.totalAmount.toNumber(),
        0,
      );

      const totalPaid = invoices.reduce(
        (sum: number, inv) => sum + inv.paidAmount.toNumber(),
        0,
      );

      return {
        invoices,
        totalRevenue,
        totalPaid,
        totalPending: totalRevenue - totalPaid,
      };
    });
  }

  async getMechanicPerformance(
    startDate?: Date,
    endDate?: Date,
  ): Promise<
    Array<{
      mechanicId: string;
      mechanicName: string;
      completedOrders: number;
      totalLaborCost: number;
      avgRepairTimeHours: number;
    }>
  > {
    return this.prisma.withRlsTransaction(async () => {
      const scoped = this.prisma.scoped();
      const workOrderWhere: Prisma.WorkOrderWhereInput = {
        milestone: { in: ['completed', 'invoiced', 'paid'] },
      };

      if (startDate || endDate) {
        workOrderWhere.completedAt = {};
        if (startDate) workOrderWhere.completedAt.gte = startDate;
        if (endDate) workOrderWhere.completedAt.lte = endDate;
      }

      const mechanics = await scoped.mechanic.findMany({
        where: { status: 'active' },
        include: {
          workOrders: {
            where: {
              workOrder: workOrderWhere,
            },
            include: {
              workOrder: {
                include: {
                  cost: true,
                },
              },
            },
          },
        },
      });

      const performance = mechanics.map((mechanic) => {
        const completedOrders = mechanic.workOrders.length;
        const totalLaborCost = mechanic.workOrders.reduce(
          (sum: number, woMechanic) =>
            sum + (woMechanic.workOrder.cost?.laborCost?.toNumber() || 0),
          0,
        );

        // Calcular tiempo promedio de reparación
        const repairTimes = mechanic.workOrders
          .filter(
            (woMechanic) =>
              woMechanic.workOrder.startedAt &&
              woMechanic.workOrder.completedAt,
          )
          .map((woMechanic) => {
            const start = new Date(woMechanic.workOrder.startedAt!).getTime();
            const end = new Date(woMechanic.workOrder.completedAt!).getTime();
            return (end - start) / (1000 * 60 * 60); // horas
          });

        const avgRepairTime =
          repairTimes.length > 0
            ? repairTimes.reduce((sum: number, time: number) => sum + time, 0) /
              repairTimes.length
            : 0;

        return {
          mechanicId: mechanic.id,
          mechanicName: mechanic.name,
          completedOrders,
          totalLaborCost,
          avgRepairTimeHours: Math.round(avgRepairTime * 10) / 10,
        };
      });

      return performance.sort((a, b) => b.completedOrders - a.completedOrders);
    });
  }

  async getWorkOrderStats(): Promise<{
    completedThisMonth: number;
    inProgress: number;
    avgCompletionTimeHours: number;
  }> {
    return this.prisma.withRlsTransaction(async () => {
      const scoped = this.prisma.scoped();
      // OTs completadas este mes
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const completedThisMonth = await scoped.workOrder.count({
        where: {
          milestone: { in: ['completed', 'invoiced', 'paid'] },
          completedAt: { gte: startOfMonth },
        },
      });

      // OTs en progreso
      const inProgress = await scoped.workOrder.count({
        where: {
          milestone: 'in_progress',
        },
      });

      // Tiempo promedio de completado (últimos 30 días)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentOrders = await scoped.workOrder.findMany({
        where: {
          milestone: { in: ['completed', 'invoiced', 'paid'] },
          completedAt: { gte: thirtyDaysAgo },
          startedAt: { not: null },
        },
        select: {
          startedAt: true,
          completedAt: true,
        },
      });

      const avgCompletionTime =
        recentOrders.length > 0
          ? recentOrders.reduce((sum: number, wo) => {
              const start = new Date(wo.startedAt!).getTime();
              const end = new Date(wo.completedAt!).getTime();
              return sum + (end - start) / (1000 * 60 * 60); // horas
            }, 0) / recentOrders.length
          : 0;

      return {
        completedThisMonth,
        inProgress,
        avgCompletionTimeHours: Math.round(avgCompletionTime * 10) / 10,
      };
    });
  }
}
