DROP POLICY IF EXISTS "Authenticated view active pharmacies" ON public.pharmacies;

CREATE POLICY "Members view their own pharmacies"
ON public.pharmacies FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.pharmacy_id = pharmacies.id)
  OR EXISTS (SELECT 1 FROM public.user_pharmacy_access a WHERE a.user_id = auth.uid() AND a.pharmacy_id = pharmacies.id)
);

CREATE OR REPLACE VIEW public.pharmacy_directory AS
  SELECT id, name, address FROM public.pharmacies WHERE is_active;

GRANT SELECT ON public.pharmacy_directory TO anon, authenticated;
GRANT ALL ON public.pharmacy_directory TO service_role;