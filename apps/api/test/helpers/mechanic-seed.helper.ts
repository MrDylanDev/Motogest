import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export interface SeedMechanicResult {
  id: string;
  tenantId: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface SeedMechanicOpts {
  tenantId: string;
  name?: string;
  email?: string;
  phone?: string;
  specializations?: string[];
  hireDate?: Date;
  notes?: string;
  status?: string;
}

export async function seedMechanic(
  prisma: PrismaClient,
  opts: SeedMechanicOpts,
): Promise<SeedMechanicResult> {
  const mechanic = await prisma.mechanic.create({
    data: {
      tenantId: opts.tenantId,
      name: opts.name ?? `Mechanic-${randomUUID().slice(0, 6)}`,
      email: opts.email ?? null,
      phone: opts.phone ?? null,
      specializations: opts.specializations ?? [],
      hireDate: opts.hireDate ?? null,
      notes: opts.notes ?? null,
      status: opts.status ?? 'active',
    },
  });

  return {
    id: mechanic.id,
    tenantId: mechanic.tenantId,
    name: mechanic.name,
    email: mechanic.email,
    phone: mechanic.phone,
  };
}

export async function truncateMechanicsTable(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE mechanics RESTART IDENTITY CASCADE');
}
