-- Enable Row-Level Security and create tenant_isolation policy on all tenant-scoped tables.
-- Source: docs/adr/0001-multi-tenancy-strategy.md (Phase 3 — Database Layer).
--
-- Defense-in-depth strategy:
--   * Layer 1 (App): TenantContext interceptor sets tenantId per request.
--   * Layer 2 (ORM): Prisma scoped() extension auto-injects WHERE tenantId.
--   * Layer 3 (DB):  This migration. RLS rejects rows that do not match
--                    current_setting('app.tenant_id') even if Layers 1/2 fail.
--
-- The application MUST connect as the `taller_app` role (NOT as a superuser
-- and NOT as the table owner) for RLS to enforce. Superusers bypass RLS;
-- table owners bypass RLS unless FORCE ROW LEVEL SECURITY is set, which
-- this migration enables.

-- ============================================
-- audit_logs
-- ============================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ============================================
-- user_tenants
-- ============================================

ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON user_tenants
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ============================================
-- subscriptions
-- ============================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON subscriptions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ============================================
-- Application database role
-- ============================================
-- The application role used by the API. NO SUPERUSER and NO BYPASSRLS so
-- that RLS policies are always enforced. The default password is intended
-- for dev/test only; production deployments MUST rotate it via:
--   ALTER ROLE taller_app PASSWORD '<secure-secret>';
-- The DO block makes this migration idempotent against pre-existing roles
-- (useful when sharing a Postgres cluster across reset/re-apply cycles).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taller_app') THEN
    CREATE ROLE taller_app
      WITH LOGIN
           PASSWORD 'taller_app_dev'
           NOSUPERUSER
           NOCREATEDB
           NOCREATEROLE
           NOINHERIT
           NOREPLICATION
           NOBYPASSRLS;
  END IF;
END$$;

-- Permissions on tenant-scoped tables (full DML, RLS still enforced).
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs    TO taller_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_tenants  TO taller_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions TO taller_app;

-- Read-only access to the global tenants table (needed for FK resolution
-- and lookups that are not themselves tenant-scoped).
GRANT SELECT ON tenants TO taller_app;

-- Required to resolve qualified table names.
GRANT USAGE ON SCHEMA public TO taller_app;
