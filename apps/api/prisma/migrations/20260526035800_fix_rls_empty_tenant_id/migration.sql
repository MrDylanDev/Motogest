-- Fix RLS policies to handle empty/unset app.tenant_id gracefully.
-- When app.tenant_id is '' (empty string), current_setting returns '' and
-- ''::uuid raises "invalid input syntax for type uuid". Using NULLIF converts
-- '' to NULL before the cast, so the comparison becomes tenant_id = NULL which
-- is always false (no rows returned, no error).
-- This is needed for global auth operations (login, email verification, refresh)
-- that query user_tenants before tenant context is established.

-- audit_logs
DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- user_tenants
DROP POLICY IF EXISTS tenant_isolation ON user_tenants;
CREATE POLICY tenant_isolation ON user_tenants
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Allow auth operations to read user_tenants by user_id without tenant context.
-- This permissive SELECT-only policy activates ONLY when app.tenant_id is unset/empty.
-- Once app.tenant_id is set (by TenantContextInterceptor), only tenant_isolation applies.
CREATE POLICY auth_lookup ON user_tenants
  FOR SELECT
  USING (NULLIF(current_setting('app.tenant_id', true), '') IS NULL);

-- subscriptions
DROP POLICY IF EXISTS tenant_isolation ON subscriptions;
CREATE POLICY tenant_isolation ON subscriptions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
