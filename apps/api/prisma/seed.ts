import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo123456!';
const BCRYPT_COST = 12;

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');

  // Create a demo tenant for development
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-taller' },
    update: {},
    create: {
      name: 'Taller Demo',
      slug: 'demo-taller',
      subdomain: 'demo-taller',
      status: 'active',
      country: 'AR',
      plan: 'premium',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(`✅ Tenant created: ${tenant.name} (${tenant.id})`);

  // Hash the demo password with the same cost factor used by AuthService.
  // Real users created via signup go through bcrypt; the seed must match
  // so that login works against the demo account.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);

  const user = await prisma.user.upsert({
    where: { email: 'admin@demo-taller.com' },
    update: { passwordHash },
    create: {
      email: 'admin@demo-taller.com',
      passwordHash,
      fullName: 'Admin Demo',
      phone: '+5491155551234',
      status: 'active',
      emailVerified: true,
    },
  });

  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    update: {},
    create: {
      userId: user.id,
      tenantId: tenant.id,
      role: 'admin_taller',
    },
  });

  console.log(`✅ User created: ${user.email} (role: admin_taller)`);
  console.log(`   Demo password: ${DEMO_PASSWORD}`);

  // Create subscription
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      plan: 'premium',
      status: 'active',
      billingCycle: 'monthly',
    },
  });

  console.log('✅ Subscription created: premium/monthly');
  console.log('🎉 Seed complete!');
}

main()
  .catch((e: unknown) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
