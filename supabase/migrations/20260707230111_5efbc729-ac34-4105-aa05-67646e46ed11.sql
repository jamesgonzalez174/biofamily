
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Rescope admin-only policies from PUBLIC (which includes anon) to authenticated
DO $$
DECLARE r record;
DECLARE ddl text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname='public' AND 'public' = ANY(roles) AND qual LIKE '%has_role%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    ddl := format('CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s)',
                  r.policyname, r.tablename, r.cmd, r.qual);
    IF r.with_check IS NOT NULL THEN
      ddl := ddl || format(' WITH CHECK (%s)', r.with_check);
    END IF;
    EXECUTE ddl;
  END LOOP;
END $$;
