-- Layer 2 of tenant isolation: Row-Level Security.
--
-- Context is supplied per transaction by the app:
--   SELECT set_config('app.tenant_id', '<tenantId>', true)   -- tenant requests
--   SELECT set_config('app.bypass_rls', 'on', true)          -- platform context (host resolution, admin, workers)
-- With neither set, tenant tables return no rows and reject writes (fail closed).

CREATE OR REPLACE FUNCTION app_tenant_matches(row_tenant text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), '') = 'on'
      OR row_tenant = nullif(current_setting('app.tenant_id', true), '')
$$;

-- "Tenant" is keyed by id; every other tenant-owned table by "tenantId".
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Tenant"
  USING (app_tenant_matches("id")) WITH CHECK (app_tenant_matches("id"));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Membership', 'Subscription', 'CustomDomain', 'Category', 'Video',
    'VideoRendition', 'AdConfig', 'StorageUsage', 'Report', 'AuditLog'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); -- applies to the table owner too
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_tenant_matches("tenantId")) WITH CHECK (app_tenant_matches("tenantId"))',
      t
    );
  END LOOP;
END $$;

-- The application role (created by docker/postgres/init.sql in dev; by you in prod).
-- It must be NOSUPERUSER and NOBYPASSRLS or the policies above are decorative.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
  END IF;
END $$;
