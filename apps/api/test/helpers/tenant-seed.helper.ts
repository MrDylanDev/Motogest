import { PrismaClient } from '@prisma/client';

export function createSeedPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL_TEST_SEED },
    },
  });
}

export function createAppPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL_TEST },
    },
  });
}

export async function seedTenant(
  prisma: PrismaClient,
  data: { name: string; slug: string; subdomain: string },
): Promise<{ id: string }> {
  const tenant = await prisma.tenant.create({ data });
  return { id: tenant.id };
}

export async function seedAuditLog(
  prisma: PrismaClient,
  data: { tenantId: string; userId: string; action: string },
): Promise<{ id: string; tenantId: string; userId: string; action: string }> {
  const log = await prisma.auditLog.create({
    data: {
      tenantId: data.tenantId,
      userId: data.userId,
      action: data.action,
      resource: 'test',
    },
  });
  return log;
}

export async function truncateTenantTables(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE audit_logs, user_tenants, subscriptions, tenants RESTART IDENTITY CASCADE',
  );
}
