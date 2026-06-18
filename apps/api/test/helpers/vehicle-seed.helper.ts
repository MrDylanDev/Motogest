import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export interface SeedVehicleResult {
  id: string;
  tenantId: string;
  clientId: string;
  make: string;
  model: string;
  plate: string;
}

export interface SeedVehicleOpts {
  tenantId: string;
  clientId: string;
  make?: string;
  model?: string;
  year?: number;
  plate?: string;
  vin?: string;
  color?: string;
  fuelType?: string;
  mileage?: number;
  notes?: string;
  status?: string;
}

export async function seedVehicle(
  prisma: PrismaClient,
  opts: SeedVehicleOpts,
): Promise<SeedVehicleResult> {
  const vehicle = await prisma.vehicle.create({
    data: {
      tenantId: opts.tenantId,
      clientId: opts.clientId,
      make: opts.make ?? 'Toyota',
      model: opts.model ?? `Corolla-${randomUUID().slice(0, 6)}`,
      year: opts.year ?? 2020,
      plate: opts.plate ?? `TEST-${randomUUID().slice(0, 6).toUpperCase()}`,
      vin: opts.vin ?? null,
      color: opts.color ?? null,
      fuelType: opts.fuelType ?? null,
      mileage: opts.mileage ?? 0,
      notes: opts.notes ?? null,
      status: opts.status ?? 'active',
    },
  });

  return {
    id: vehicle.id,
    tenantId: vehicle.tenantId,
    clientId: vehicle.clientId,
    make: vehicle.make,
    model: vehicle.model,
    plate: vehicle.plate,
  };
}

export async function truncateVehiclesTable(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE vehicles RESTART IDENTITY CASCADE');
}
