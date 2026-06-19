import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export interface SeedInvoiceResult {
  id: string;
  tenantId: string;
  workOrderId: string;
  clientId: string;
  invoiceNumber: string;
  status: string;
}

export interface SeedInvoiceOpts {
  tenantId: string;
  workOrderId: string;
  clientId: string;
  invoiceNumber?: string;
  status?: string;
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  totalAmount?: number;
  paidAmount?: number;
  notes?: string;
}

export async function seedInvoice(
  prisma: PrismaClient,
  opts: SeedInvoiceOpts,
): Promise<SeedInvoiceResult> {
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: opts.tenantId,
      workOrderId: opts.workOrderId,
      clientId: opts.clientId,
      invoiceNumber:
        opts.invoiceNumber ?? `INV-${randomUUID().slice(0, 4).toUpperCase()}`,
      status: opts.status ?? 'pending',
      subtotal: opts.subtotal ?? 1000,
      taxRate: opts.taxRate ?? 0.21,
      taxAmount: opts.taxAmount ?? 210,
      totalAmount: opts.totalAmount ?? 1210,
      paidAmount: opts.paidAmount ?? 0,
      notes: opts.notes,
    },
  });

  return {
    id: invoice.id,
    tenantId: invoice.tenantId,
    workOrderId: invoice.workOrderId,
    clientId: invoice.clientId,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
  };
}

export async function truncateInvoicesTable(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE payments, invoices RESTART IDENTITY CASCADE',
  );
}
