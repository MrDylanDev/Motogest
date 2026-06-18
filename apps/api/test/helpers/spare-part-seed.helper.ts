import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Decimal } from '@prisma/client/runtime/library';

export interface SeedSparePartResult {
  id: string;
  tenantId: string;
  code: string;
  name: string;
}

export interface SeedSparePartOpts {
  tenantId: string;
  code?: string;
  name?: string;
  description?: string;
  category?: string;
  unit?: string;
  currentStock?: number;
  minStock?: number;
  maxStock?: number;
  unitCost?: number;
  sellingPrice?: number;
  supplier?: string;
  notes?: string;
  status?: string;
}

export async function seedSparePart(
  prisma: PrismaClient,
  opts: SeedSparePartOpts,
): Promise<SeedSparePartResult> {
  const sparePart = await prisma.sparePart.create({
    data: {
      tenantId: opts.tenantId,
      code: opts.code ?? `SP-${randomUUID().slice(0, 6).toUpperCase()}`,
      name: opts.name ?? `Part-${randomUUID().slice(0, 6)}`,
      description: opts.description ?? null,
      category: opts.category ?? null,
      unit: opts.unit ?? 'unit',
      currentStock: opts.currentStock ?? 0,
      minStock: opts.minStock ?? 0,
      maxStock: opts.maxStock ?? 0,
      unitCost: opts.unitCost != null ? new Decimal(opts.unitCost) : null,
      sellingPrice:
        opts.sellingPrice != null ? new Decimal(opts.sellingPrice) : null,
      supplier: opts.supplier ?? null,
      notes: opts.notes ?? null,
      status: opts.status ?? 'active',
    },
  });

  return {
    id: sparePart.id,
    tenantId: sparePart.tenantId,
    code: sparePart.code,
    name: sparePart.name,
  };
}

export async function truncateSparePartsTable(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE spare_parts RESTART IDENTITY CASCADE',
  );
}
