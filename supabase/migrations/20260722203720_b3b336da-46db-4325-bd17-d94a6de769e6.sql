DROP POLICY IF EXISTS "Authenticated can view invoices" ON public.invoices;

CREATE POLICY "Users can view invoices for their pharmacies"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    pharmacy_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.user_pharmacy_access upa WHERE upa.user_id = auth.uid() AND upa.pharmacy_id = invoices.pharmacy_id)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.pharmacy_id = invoices.pharmacy_id)
    )
  )
);