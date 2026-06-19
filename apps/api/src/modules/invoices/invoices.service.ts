import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoiceDto } from './dto/query-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async createInvoice(
    tenantId: string,
    workOrderId: string,
    dto: CreateInvoiceDto,
  ) {
    return this.prisma.withRlsTransaction(async (tx) => {
      // 1. Fetch WorkOrder with cost and client
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
        include: { cost: true, client: true },
      });

      if (!workOrder) {
        throw new NotFoundException('WorkOrder not found');
      }

      // 2. Validate WorkOrder status
      if (workOrder.milestone !== 'completed') {
        throw new BadRequestException(
          'WorkOrder must be in completed state to create invoice',
        );
      }

      // 3. Check no existing invoice
      const existing = await tx.invoice.findFirst({
        where: { workOrderId, tenantId },
      });
      if (existing) {
        throw new ConflictException(
          'Invoice already exists for this WorkOrder',
        );
      }

      // 4. Validate cost exists
      if (!workOrder.cost || !workOrder.cost.total) {
        throw new BadRequestException(
          'WorkOrder must have cost calculated before invoicing',
        );
      }

      // 5. Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber(tenantId, tx);

      // 6. Create invoice (snapshot)
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          workOrderId: workOrder.id,
          clientId: workOrder.clientId,
          invoiceNumber,
          issueDate: new Date(),
          status: 'pending',
          subtotal: workOrder.cost.subtotal || new Decimal(0),
          taxRate: workOrder.cost.taxRate || new Decimal(0.21),
          taxAmount: workOrder.cost.taxAmount || new Decimal(0),
          totalAmount: workOrder.cost.total,
          paidAmount: new Decimal(0),
          notes: dto.notes,
        },
      });

      // 7. Update WorkOrder status to 'invoiced'
      await tx.workOrder.update({
        where: { id: workOrderId },
        data: { milestone: 'invoiced' },
      });

      return invoice;
    });
  }

  private async generateInvoiceNumber(
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const maxInvoice = await tx.invoice.findFirst({
      where: { tenantId },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    const nextNumber = maxInvoice
      ? parseInt(maxInvoice.invoiceNumber.replace('INV-', ''), 10) + 1
      : 1;

    return `INV-${String(nextNumber).padStart(4, '0')}`;
  }

  async findAll(
    tenantId: string,
    query: QueryInvoiceDto,
    userId?: string,
    userRole?: string,
  ) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const where: Prisma.InvoiceWhereInput = { tenantId };

      // Mechanic restriction
      if (userRole === 'mecanico' && userId) {
        where.workOrder = {
          mechanics: {
            some: { mechanicId: userId },
          },
        };
      }

      // Apply filters
      if (query.status) where.status = query.status;
      if (query.clientId) where.clientId = query.clientId;
      if (query.dateFrom || query.dateTo) {
        where.issueDate = {};
        if (query.dateFrom) where.issueDate.gte = new Date(query.dateFrom);
        if (query.dateTo) where.issueDate.lte = new Date(query.dateTo);
      }

      const page = query.page || 1;
      const limit = query.limit || 20;
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        tx.invoice.findMany({
          where,
          include: { client: true, workOrder: true, payments: true },
          orderBy: { issueDate: 'desc' },
          skip,
          take: limit,
        }),
        tx.invoice.count({ where }),
      ]);

      return { data, total, page, limit };
    });
  }

  async findOne(tenantId: string, id: string) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id, tenantId },
        include: {
          client: true,
          workOrder: true,
          payments: { orderBy: { paymentDate: 'desc' } },
        },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      return invoice;
    });
  }
}
