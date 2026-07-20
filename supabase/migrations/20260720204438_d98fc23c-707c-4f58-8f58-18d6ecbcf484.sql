DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

CREATE POLICY "Users update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND points_balance = (SELECT p.points_balance FROM public.profiles p WHERE p.id = auth.uid())
  AND lifetime_points = (SELECT p.lifetime_points FROM public.profiles p WHERE p.id = auth.uid())
  AND tier = (SELECT p.tier FROM public.profiles p WHERE p.id = auth.uid())
  AND (
    -- pharmacy unchanged, OR being set for the first time (was NULL)
    NOT (pharmacy_id IS DISTINCT FROM (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid()))
    OR (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid()) IS NULL
  )
);