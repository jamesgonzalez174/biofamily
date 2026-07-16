-- 1) product-images bucket: admin-only policies (bucket is private and currently policy-less)
CREATE POLICY "Admins read product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins update product images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins delete product images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) profiles: allow setting pharmacy_id once (NULL -> value), never reassign.
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND points_balance = (SELECT p.points_balance FROM public.profiles p WHERE p.id = auth.uid())
    AND lifetime_points = (SELECT p.lifetime_points FROM public.profiles p WHERE p.id = auth.uid())
    AND tier = (SELECT p.tier FROM public.profiles p WHERE p.id = auth.uid())
    AND (
      -- pharmacy_id may only stay the same, or be set for the first time from NULL
      pharmacy_id IS NOT DISTINCT FROM (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
      OR (
        (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid()) IS NULL
        AND pharmacy_id IS NOT NULL
      )
    )
  );