-- Security hardening that drizzle-kit cannot express declaratively.
--
-- 1. Append-only tables: audit_logs and activation_events can be inserted into
--    but never updated or deleted, even by the application role.
-- 2. Row Level Security lock-down: every table in the public schema has RLS
--    enabled with NO policies. The application connects as the table owner
--    (which bypasses RLS), while Supabase's Data API roles (anon,
--    authenticated) can read or write nothing, even if the API is left on.
--    Authorization is enforced in the application's service layer.

CREATE OR REPLACE FUNCTION public.forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER activation_events_append_only
  BEFORE UPDATE OR DELETE ON public.activation_events
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
--> statement-breakpoint
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
    END IF;
  END LOOP;
END;
$$;
