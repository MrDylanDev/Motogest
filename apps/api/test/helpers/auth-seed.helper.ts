import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { signTestJwt } from './jwt.helper';

export interface SeedActiveUserResult {
  tenantId: string;
  userId: string;
  email: string;
  password: string;
  role: string;
  accessToken: string;
}

export interface SeedPendingUserResult {
  tenantId: string;
  userId: string;
  email: string;
  password: string;
  role: string;
  verificationToken: string;
}

export interface SeedUserOpts {
  email?: string;
  password?: string;
  fullName?: string;
  tenantName?: string;
  tenantSlug?: string;
  role?: string;
}

export async function seedActiveUserWithTenant(
  prisma: PrismaClient,
  opts: SeedUserOpts = {},
): Promise<SeedActiveUserResult> {
  const email = opts.email ?? `user-${randomUUID()}@test.local`;
  const password = opts.password ?? 'Test1234!';
  const role = opts.role ?? 'admin_taller';
  const passwordHash = await bcrypt.hash(password, 4);

  const tenant = await prisma.tenant.create({
    data: {
      name: opts.tenantName ?? 'Test Tenant',
      slug: opts.tenantSlug ?? `t-${randomUUID().slice(0, 8)}`,
      subdomain: `s-${randomUUID().slice(0, 8)}`,
      status: 'active',
    },
  });

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: opts.fullName ?? 'Test User',
      status: 'active',
      emailVerified: true,
    },
  });

  await prisma.userTenant.create({
    data: { userId: user.id, tenantId: tenant.id, role },
  });

  await prisma.subscription.create({
    data: { tenantId: tenant.id, plan: 'free', status: 'trialing' },
  });

  await prisma.emailVerification.create({
    data: {
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() - 1000),
      usedAt: new Date(),
    },
  });

  const accessToken = signTestJwt({ sub: user.id, tenantId: tenant.id, role });

  return {
    tenantId: tenant.id,
    userId: user.id,
    email,
    password,
    role,
    accessToken,
  };
}

export async function seedPendingUserWithTenant(
  prisma: PrismaClient,
  opts: SeedUserOpts = {},
): Promise<SeedPendingUserResult> {
  const email = opts.email ?? `user-${randomUUID()}@test.local`;
  const password = opts.password ?? 'Test1234!';
  const role = opts.role ?? 'admin_taller';
  const passwordHash = await bcrypt.hash(password, 4);

  const tenant = await prisma.tenant.create({
    data: {
      name: opts.tenantName ?? 'Pending Tenant',
      slug: opts.tenantSlug ?? `t-${randomUUID().slice(0, 8)}`,
      subdomain: `s-${randomUUID().slice(0, 8)}`,
      status: 'pending_verification',
    },
  });

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: opts.fullName ?? 'Pending User',
      status: 'pending_verification',
      emailVerified: false,
    },
  });

  await prisma.userTenant.create({
    data: { userId: user.id, tenantId: tenant.id, role },
  });

  await prisma.subscription.create({
    data: { tenantId: tenant.id, plan: 'free', status: 'trialing' },
  });

  const verificationToken = randomUUID();
  await prisma.emailVerification.create({
    data: {
      userId: user.id,
      token: verificationToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  return {
    tenantId: tenant.id,
    userId: user.id,
    email,
    password,
    role,
    verificationToken,
  };
}

export async function truncateAuthTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE refresh_tokens, email_verifications, user_tenants, subscriptions, tenants, users RESTART IDENTITY CASCADE',
  );
}
