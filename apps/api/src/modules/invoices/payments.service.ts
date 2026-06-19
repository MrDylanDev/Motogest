import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async registerPayment(
    tenantId: string,
    invoiceId: string,
    dto: CreatePaymentDto,
    receivedBy: string,
  ) {
    return this.prisma.withRlsTransaction(async (tx) => {
      // 1. Fetch invoice
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: { workOrder: true },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      // 2. Validate invoice is payable
      if (invoice.status === 'cancelled') {
        throw new BadRequestException('Cannot pay a cancelled invoice');
      }

      // 3. Create payment
      const payment = await tx.payment.create({
        data: {
          tenantId,
          invoiceId,
          amount: new Decimal(dto.amount),
          method: dto.method,
          reference: dto.reference,
          receivedBy,
        },
      });

      // 4. Calculate new paidAmount
      const paidAmountResult = await tx.payment.aggregate({
        where: { invoiceId, tenantId },
        _sum: { amount: true },
      });

      const paidAmount = paidAmountResult._sum.amount || new Decimal(0);
      const totalAmount = invoice.totalAmount;

      // 5. Determine new status
      let newStatus: 'pending' | 'partial' | 'paid' | 'overpaid';
      if (paidAmount.equals(totalAmount)) {
        newStatus = 'paid';
      } else if (paidAmount.greaterThan(totalAmount)) {
        newStatus = 'overpaid';
      } else if (paidAmount.greaterThan(0)) {
        newStatus = 'partial';
      } else {
        newStatus = 'pending';
      }

      // 6. Update invoice
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount,
          status: newStatus,
        },
        include: {
          workOrder: true,
          payments: true,
        },
      });

      // 7. If fully paid, update WorkOrder status
      if (newStatus === 'paid') {
        await tx.workOrder.update({
          where: { id: invoice.workOrderId },
          data: { milestone: 'paid' },
        });
      }

      return {
        payment,
        invoice: updatedInvoice,
      };
    });
  }
}
