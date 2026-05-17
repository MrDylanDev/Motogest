# Multi-Tenancy Conventions

This document describes the rules and patterns for working with tenant-scoped data in this codebase. Follow these conventions when adding new tables, writing handlers, or reviewing code that touches tenant data.

## TL;DR

- Every tenant-scoped table has a `tenant_id UUID NOT NULL` column with FK to `tenants.id`.
- Every tenant-scoped table has a composite index starting with `tenant_id`.
- Every tenant-scoped table has RLS enabled and forced, with a `tenant_isolation` policy.
- Every query touching a tenant-scoped table runs inside `withRlsTransaction()`.
- Cross-tenant access attempts return **404**, never 403.

## When you add a new tenant-scoped table

1. Add the column and FK in `apps/api/prisma/schema.prisma`:

   ```prisma
   model Vehicle {
     id       String @id @default(uuid()) @db.Uuid
     tenantId String @map("tenant_id") @db.Uuid
     tenant   Tenant @relation(fields: [tenantId], references: [id])
     // ... other fields

     @@index([tenantId, createdAt])
     @@map("vehicles")
   }
   ```

2. Run the schema migration:

   ```bash
   pnpm --filter @taller-saas/api exec prisma migrate dev --name add_vehicles
   ```

3. Generate the RLS migration SQL:

   ```bash
   pnpm --filter @taller-saas/api exec ts-node scripts/generate-rls-migration.ts vehicles
   ```

4. Create a new migration directory and save the output:

   ```bash
   mkdir -p apps/api/prisma/migrations/<timestamp>_enable_rls_vehicles
   # Paste or redirect the generated SQL into migration.sql
   ```

5. Apply the migration:

   ```bash
   pnpm --filter @taller-saas/api exec prisma migrate deploy
   ```

6. Add the model name to `TENANT_SCOPED_MODELS` in `apps/api/src/common/prisma/prisma.service.ts`:

   ```ts
   export const TENANT_SCOPED_MODELS = [
     'AuditLog',
     'UserTenant',
     'Subscription',
     'Vehicle', // ← add here
   ] as const;
   ```

7. Write at least one e2e isolation test verifying the new table follows the cross-tenant 404 rule. See `apps/api/test/multi-tenant-isolation.e2e-spec.ts` for examples.

## How to write a handler that queries a tenant-scoped table

Use `withRlsTransaction()` for every query that touches tenant data:

```ts
@Get()
async findAll(): Promise<Vehicle[]> {
  return this.prisma.withRlsTransaction(async (tx) =>
    tx.vehicle.findMany({ orderBy: { createdAt: 'desc' } }),
  );
}
```

**Why**: The application connects as `taller_app`, which has `NOBYPASSRLS`. Without `SET LOCAL app.tenant_id` (which `withRlsTransaction` provides), RLS returns zero rows for every tenant-scoped table — even through the ORM.

Within the transaction, use `scoped()` for defense-in-depth:

```ts
return this.prisma.withRlsTransaction(async (tx) =>
  tx.scoped().vehicle.findMany({ orderBy: { createdAt: 'desc' } }),
);
```

`scoped()` auto-injects `tenantId` on creates and adds `WHERE tenantId` on read/update/delete operations. This is the second layer of defense — if RLS were somehow bypassed, the ORM filter still protects isolation.

## Cross-tenant access → 404, NOT 403

Never reveal whether a resource exists in another tenant. Return 404 for any resource not found within the current tenant scope:

```ts
@Get(':id')
async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Vehicle> {
  const vehicle = await this.prisma.withRlsTransaction(async (tx) =>
    tx.scoped().vehicle.findUnique({ where: { id } }),
  );

  if (!vehicle) {
    throw new NotFoundException(`Vehicle ${id} not found`);
  }

  return vehicle;
}
```

Returning 403 would leak that the resource exists but belongs to someone else. A 404 is indistinguishable from "does not exist at all."

## Operational notes

- The application role is `taller_app` (`NOSUPERUSER NOBYPASSRLS`). Rotate the password before going to production (current dev value: `taller_app_dev`).
- Migrations are applied as `taller` (superuser) because creating roles, granting permissions, and altering RLS policies require superuser privileges. The runtime application never connects as `taller`.
- In tests, fixtures are seeded via `DATABASE_URL_TEST_SEED` (connects as `taller`) and the application under test uses `DATABASE_URL_TEST` (connects as `taller_app`). This is intentional — it mirrors production isolation.

## Future work

The current pattern requires every handler to explicitly wrap queries in `withRlsTransaction()`. A future ADR may introduce an automatic decorator or interceptor that handles this transparently at the module level. Until that ADR is accepted and implemented, the explicit wrap is the rule.

## Reference

- [ADR-0001: Multi-Tenancy Strategy](adr/0001-multi-tenancy-strategy.md)
- [AGENTS.md](../AGENTS.md) — code review rules including multi-tenancy section
- [RLS Migration Helper](../apps/api/scripts/generate-rls-migration.ts) — generates migration SQL for new tables
