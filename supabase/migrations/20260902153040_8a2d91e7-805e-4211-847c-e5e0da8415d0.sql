DROP POLICY IF EXISTS "Anyone can read the pharmacy directory" ON public.pharmacy_directory;

CREATE POLICY "Signed-in users can read the pharmacy directory"
  ON public.pharmacy_directory FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.pharmacy_directory FROM anon;
GRANT SELECT ON public.pharmacy_directory TO authenticated;
GRANT ALL ON public.pharmacy_directory TO service_role;