DROP POLICY IF EXISTS "Signed-in users can read the pharmacy directory" ON public.pharmacy_directory;
CREATE POLICY "Scoped pharmacy directory reads" ON public.pharmacy_directory
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
     AND (p.pharmacy_id IS NULL OR p.pharmacy_id = pharmacy_directory.id OR p.requested_pharmacy_id = pharmacy_directory.id))
  OR EXISTS (SELECT 1 FROM public.user_pharmacy_access a WHERE a.user_id = auth.uid() AND a.pharmacy_id = pharmacy_directory.id)
);