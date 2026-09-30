DROP POLICY IF EXISTS "Anyone authed reads settings" ON public.settings;
CREATE POLICY "Admins read settings" ON public.settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE OR REPLACE FUNCTION public.get_member_settings()
RETURNS TABLE(points_expire_at timestamptz, tickets_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.points_expire_at, s.tickets_enabled FROM public.settings s WHERE s.id = 1 AND auth.uid() IS NOT NULL
$$;
REVOKE EXECUTE ON FUNCTION public.get_member_settings() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_member_settings() TO authenticated;