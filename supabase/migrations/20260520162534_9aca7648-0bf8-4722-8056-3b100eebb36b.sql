DROP POLICY IF EXISTS "Authed view active pharmacies" ON public.pharmacies;
CREATE POLICY "Public view active pharmacies" ON public.pharmacies
  FOR SELECT USING (is_active OR public.has_role(auth.uid(), 'admin'));