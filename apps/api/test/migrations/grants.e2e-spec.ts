import { PrismaClient } from '@prisma/client';

/**
 * Introspection test: verifies taller_app has the required GRANTs.
 * Uses information_schema.role_table_grants to query permissions.
 *
 * RED: This test MUST fail before the auth_foundation migration is applied
 * because taller_app lacks DML on users, INSERT on tenants, and the
 * email_verifications / refresh_tokens tables don't exist yet.
 */
describe('taller_app database grants (e2e)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL_TEST_SEED },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function getGrantsForTable(tableName: string): Promise<string[]> {
    const rows = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee = 'taller_app'
        AND table_schema = 'public'
        AND table_name = ${tableName}
    `;
    return rows.map((r) => r.privilege_type);
  }

  it('taller_app has SELECT, INSERT, UPDATE, DELETE on users', async () => {
    const grants = await getGrantsForTable('users');
    expect(grants).toEqual(
      expect.arrayContaining(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
    );
  });

  it('taller_app has INSERT on tenants', async () => {
    const grants = await getGrantsForTable('tenants');
    expect(grants).toContain('INSERT');
  });

  it('taller_app has SELECT, INSERT, UPDATE, DELETE on email_verifications', async () => {
    const grants = await getGrantsForTable('email_verifications');
    expect(grants).toEqual(
      expect.arrayContaining(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
    );
  });

  it('taller_app has SELECT, INSERT, UPDATE, DELETE on refresh_tokens', async () => {
    const grants = await getGrantsForTable('refresh_tokens');
    expect(grants).toEqual(
      expect.arrayContaining(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
    );
  });

  it('taller_app remains NOSUPERUSER and NOBYPASSRLS', async () => {
    const roles = await prisma.$queryRaw<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >`
      SELECT rolsuper, rolbypassrls
      FROM pg_roles
      WHERE rolname = 'taller_app'
    `;
    expect(roles).toHaveLength(1);
    expect(roles[0].rolsuper).toBe(false);
    expect(roles[0].rolbypassrls).toBe(false);
  });
});
